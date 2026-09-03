/**
 * Live Supabase smoke tests — requires tests/test.config.json (see test.config.example.json).
 * Run: npm run test:live
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');
const configPath = join(root, 'tests', 'test.config.json');

let passed = 0;
let failed = 0;
let skipped = 0;

function assert(label, cond) {
  if (cond) {
    passed += 1;
    console.log(`  ok  ${label}`);
  } else {
    failed += 1;
    console.error(` FAIL ${label}`);
  }
}

function skip(label, reason) {
  skipped += 1;
  console.log(` skip ${label} (${reason})`);
}

function loadConfig() {
  if (!existsSync(configPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (e) {
    console.error('Could not parse tests/test.config.json:', e.message);
    process.exit(1);
  }
}

async function signIn(supabase, account, label) {
  if (!account?.email || !account?.password) {
    skip(`${label} sign-in`, 'email/password missing in config');
    return null;
  }
  const { data, error } = await supabase.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });
  if (error) {
    assert(`${label} sign-in`, false);
    console.error(`       ${error.message}`);
    return null;
  }
  assert(`${label} sign-in`, !!data.user?.id);
  return data.user;
}

async function testPlayer(supabase, user) {
  const charRes = await supabase
    .from('characters')
    .select(
      'id,name,hp_current,hp_total,exoskin_slots_remaining,clothing_layers,is_active'
    )
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (charRes.error && /clothing_layers/i.test(charRes.error.message || '')) {
    const fallback = await supabase
      .from('characters')
      .select('id,name,hp_current,hp_total,exoskin_slots_remaining,is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    assert('active character loads', !fallback.error && !!fallback.data);
    if (fallback.data) {
      skip('clothing_layers column', 'run sql/019 in Supabase');
    }
    return fallback.data;
  }

  assert('active character loads', !charRes.error && !!charRes.data);
  if (charRes.error) {
    console.error(`       ${charRes.error.message}`);
    return null;
  }

  const ch = charRes.data;
  assert('character has name', !!ch.name);
  assert('HP fields present', ch.hp_total != null && ch.hp_current != null);

  const statsRes = await supabase
    .from('character_stats')
    .select('stat_strength,stat_agility')
    .eq('character_id', ch.id)
    .maybeSingle();
  assert('character stats row', !statsRes.error && !!statsRes.data);

  const eqRes = await supabase
    .from('character_equipment')
    .select('slot,exo_left,slots_remaining,item_id')
    .eq('character_id', ch.id);
  assert('equipment rows load', !eqRes.error);
  const slots = new Set((eqRes.data || []).map((r) => r.slot));
  assert('has equipment slot rows', slots.size >= 1);

  const exoOn = (eqRes.data || []).filter((r) => Number(r.exo_left) > 0).length;
  console.log(
    `       → ${ch.name}: HP ${ch.hp_current}/${ch.hp_total}, clothing ${exoOn}/5`
  );

  return ch;
}

async function testDm(supabase, user) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  assert('DM profile role', profile?.role === 'dm');

  const { data: chars, error } = await supabase
    .from('characters')
    .select('id,name,is_active')
    .eq('is_active', true)
    .limit(5);
  assert('DM can read active roster', !error && Array.isArray(chars));

  const { data: setting, error: setErr } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'clothing_display')
    .maybeSingle();
  if (setErr && /app_settings|does not exist/i.test(setErr.message || '')) {
    skip('app_settings clothing_display', 'run sql/018 in Supabase');
  } else {
    assert('clothing display setting readable', !setErr);
    if (setting?.value) {
      console.log(`       → clothing display mode: ${setting.value}`);
    }
  }
}

async function main() {
  console.log('Live integration tests\n');

  const cfg = loadConfig();
  if (!cfg) {
    console.log(
      'No tests/test.config.json — copy tests/test.config.example.json and add your test accounts.\n'
    );
    process.exit(0);
  }

  const url = cfg.supabaseUrl;
  const key = cfg.supabaseAnonKey;
  if (!url || !key || key.includes('YOUR_ANON')) {
    console.error(
      'Set supabaseUrl and supabaseAnonKey in tests/test.config.json (copy anon key from js/config.js).\n'
    );
    process.exit(1);
  }

  const supabase = createClient(url, key);

  const player = await signIn(supabase, cfg.player, 'Player');
  if (player) {
    await testPlayer(supabase, player);
    await supabase.auth.signOut();
  }

  if (cfg.dm?.email) {
    const dm = await signIn(supabase, cfg.dm, 'DM');
    if (dm) {
      await testDm(supabase, dm);
      await supabase.auth.signOut();
    }
  } else {
    skip('DM tests', 'no dm block in config');
  }

  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

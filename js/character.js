const supabase = window.supabase.createClient(
  'https://fqegrllwoskrfcnmzlod.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxZWdybGx3b3NrcmZjbm16bG9kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0ODk1ODEsImV4cCI6MjA3MDA2NTU4MX0.bI0gGkXD8U-C9lhOkWgJ0QN9swx0lLX5rFpVpI_D2DE'
);

// Tabs
document.querySelectorAll('.tab').forEach((t) => {
  t.addEventListener('click', () => {
    document
      .querySelectorAll('.tab')
      .forEach((x) => x.classList.remove('active'));
    document
      .querySelectorAll('.page')
      .forEach((x) => x.classList.remove('active'));
    t.classList.add('active');
    document.getElementById('page-' + t.dataset.tab).classList.add('active');
  });
});

const msg = document.getElementById('msg');
const set = (id, v) => {
  const el = document.getElementById(id);
  el.textContent = v === null || v === undefined ? '—' : v;
};

function mapAndRender(c, owner) {
  set('charName', c.name);
  set('charRace', c.race);
  set('charClass', c['class']); // bracket notation avoids linter noise
  set('charLevel', c.level ? 'Lvl ' + c.level : 'Lvl —');
  set('ownerEmail', owner?.email || '—');
  set('ownerId', c.user_id || '—');

  set('hp', c.hp);
  set('stress', c.stress);
  set('hope', c.hope);
  set('agility', c.agility);
  set('strength', c.strength);
  set('finesse', c.finesse);
  set('instinct', c.instinct);
  set('presence', c.presence);
  set('knowledge', c.knowledge);
  set('armor', c.armor);
  set('evasion', c.evasion);
  set('thMinor', c.dmg_minor);
  set('thMajor', c.dmg_major);
  set('thSevere', c.dmg_severe);
  set('notes', c.notes);
}

async function load() {
  const {
    data: { user },
    error: uerr,
  } = await supabase.auth.getUser();
  if (uerr || !user) {
    msg.textContent = 'Not logged in.';
    return;
  }

  const { data: c, error } = await supabase
    .from('characters')
    .select('*')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (error) {
    msg.textContent = 'Error: ' + error.message;
    return;
  }
  if (!c) {
    msg.textContent = 'No character assigned to your account yet.';
    return;
  }
  msg.textContent = '';

  let owner = { email: '—' };
  try {
    const { data: p } = await supabase
      .from('profiles')
      .select('username,email') // drop email here if you didn’t store it
      .eq('id', c.user_id)
      .maybeSingle();
    owner.email = p?.email ?? '—';
  } catch {}

  mapAndRender(c, owner);

  try {
    const { data: items } = await supabase
      .from('inventory_items')
      .select('id,name,qty,slot')
      .eq('character_id', c.id)
      .order('slot', { ascending: true });
    renderInventory(items || []);
  } catch {
    renderInventory([]);
  }

  try {
    const { data: ach } = await supabase
      .from('achievements_unlocked')
      .select('id,code,title,granted_at')
      .eq('character_id', c.id)
      .order('granted_at', { ascending: false });
    renderAchievements(ach || []);
  } catch {
    renderAchievements([]);
  }

  try {
    const { data: vs } = await supabase
      .from('viewership_stats')
      .select('followers,live_viewers,lifetime_views')
      .eq('character_id', c.id)
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    set('followers', vs?.followers);
    set('liveViewers', vs?.live_viewers);
    set('lifetimeViews', vs?.lifetime_views);
  } catch {}
}

function renderInventory(items) {
  const list = document.getElementById('inventoryList');
  const empty = document.getElementById('inventoryEmpty');
  list.innerHTML = '';
  if (!items.length) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  items.forEach((i) => {
    const div = document.createElement('div');
    div.className = 'card row';
    div.innerHTML = `
      <div><strong>${i.name}</strong></div>
      <div class="muted">x${i.qty ?? 1}</div>
      ${i.slot ? `<div class="pill">${i.slot}</div>` : ''}
    `;
    list.appendChild(div);
  });
}

function renderAchievements(rows) {
  const list = document.getElementById('achievementsList');
  const empty = document.getElementById('achievementsEmpty');
  list.innerHTML = '';
  if (!rows.length) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  rows.forEach((r) => {
    const div = document.createElement('div');
    div.className = 'card';
    const when = r.granted_at ? new Date(r.granted_at).toLocaleString() : '';
    div.innerHTML = `<div><strong>${r.title ?? r.code}</strong></div>
                     <div class="muted">${when}</div>`;
    list.appendChild(div);
  });
}

load();

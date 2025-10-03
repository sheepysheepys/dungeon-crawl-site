// /js/character.js
console.log('[character] start', {
  hasApp: !!window.App,
  hasInventory: !!window.App?.Features?.inventory,
  hasSb: !!window.sb,
  hasStripLogic: !!window.App?.Logic?.strip,
  hasInvLogic: !!window.App?.Logic?.inventory,
});

// ================= STATE & UTIL =================
function setCharacter(ch) {
  window.AppState = window.AppState || {};
  window.AppState.character = ch;
  window.dispatchEvent(new CustomEvent('character:ready', { detail: ch }));
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (m) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[
        m
      ])
  );
}
function capitalize(s) {
  return (s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
}

// Small utility: wait for a condition (e.g., sb, feature) with timeout
async function waitFor(condFn, { tries = 40, delayMs = 125 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      if (condFn()) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

// ================= RENDERERS =================
function renderHP(ch) {
  const elCur = document.getElementById('hpCurrent');
  const elTot = document.getElementById('hpTotal');
  const elBar = document.getElementById('hpBar');
  if (!elCur || !elTot || !elBar) {
    console.warn('[HP] missing DOM');
    return;
  }

  const total = Number(ch?.hp_total ?? 0);
  const current = Math.max(0, Math.min(total, Number(ch?.hp_current ?? 0)));
  elCur.textContent = String(current);
  elTot.textContent = String(total);

  const pct = total > 0 ? (current / total) * 100 : 0;
  elBar.style.width = pct.toFixed(2) + '%';

  // thresholds (with fallbacks)
  const t1 = Number.isFinite(ch?.dmg_t1)
    ? Number(ch.dmg_t1)
    : Number.isFinite(ch?.dmg_minor)
    ? Number(ch.dmg_minor)
    : 7;

  const t2Raw = Number.isFinite(ch?.dmg_t2)
    ? Number(ch.dmg_t2)
    : Number.isFinite(ch?.dmg_major)
    ? Number(ch.dmg_major)
    : 14;

  const t2 = Math.max(t1 + 1, t2Raw); // ensure T2 > T1

  setText?.('thT1', t1);
  setText?.('thT2', t2);

  const t1El = document.getElementById('t1Val');
  const t2LowEl = document.getElementById('t2Low');
  const t2ValEl = document.getElementById('t2Val');
  const t3LowEl = document.getElementById('t3Low');

  if (t1El) t1El.textContent = String(t1);
  if (t2LowEl) t2LowEl.textContent = String(t1 + 1);
  if (t2ValEl) t2ValEl.textContent = String(t2);
  if (t3LowEl) t3LowEl.textContent = String(t2 + 1);
}

function renderHope(ch) {
  const dotsEl = document.getElementById('hopeDots');
  if (!dotsEl) {
    console.warn('[Hope] missing DOM');
    return;
  }
  const val = Math.max(0, Math.min(5, Number(ch?.hope_points ?? 0)));
  dotsEl.textContent =
    typeof fmtDots === 'function'
      ? fmtDots(val)
      : '●'.repeat(val) + '○'.repeat(5 - val);
}

// ================= HP / HOPE MUTATIONS =================
async function adjustHP(delta) {
  const client = window.sb;
  const ch = window.AppState?.character;
  if (!client || !ch?.id) return;

  const total = Number(ch.hp_total ?? 0);
  const next = Math.max(0, Math.min(total, Number(ch.hp_current ?? 0) + delta));

  const { data, error } = await client
    .from('characters')
    .update({ hp_current: next })
    .eq('id', ch.id)
    .select('id,hp_current,hp_total,dmg_minor,dmg_major,dmg_severe')
    .single();

  if (error) {
    console.error('[HP] update failed', error);
    setText?.('msg', 'HP update blocked (auth/RLS?).');
    return;
  }

  Object.assign(ch, data);
  renderHP(ch);
  setText?.('msg', '');
}

async function adjustHope(delta) {
  const client = window.sb;
  const ch = window.AppState?.character;
  if (!client || !ch?.id) return;

  const next = Math.max(0, Math.min(5, Number(ch.hope_points ?? 0) + delta));

  const { data, error } = await client
    .from('characters')
    .update({ hope_points: next })
    .eq('id', ch.id)
    .select('hope_points')
    .single();

  if (error) {
    console.error('[Hope] update failed', error);
    setText?.('msg', 'Hope update blocked (auth/RLS?).');
    return;
  }

  ch.hope_points = data.hope_points;
  renderHope(ch);
  setText?.('msg', '');
}

window.adjustHP = adjustHP;
window.adjustHope = adjustHope;

// ================= AWARDS & LOOT =================
function renderAwardsList(list) {
  const wrap = document.getElementById('awardsList');
  if (!wrap) return;
  if (!list?.length) {
    wrap.innerHTML = `<div class="tinybars">No achievements yet.</div>`;
    return;
  }
  wrap.innerHTML = list
    .map(
      (a) => `
      <div class="row">
        <div>
          <div><strong>${escapeHtml(a.title)}</strong></div>
          ${a.description ? `<div>${escapeHtml(a.description)}</div>` : ``}
          <div class="meta">${new Date(a.awarded_at).toLocaleString()}</div>
        </div>
        <div></div>
      </div>`
    )
    .join('');
}

function renderLootList(list) {
  const wrap = document.getElementById('lootList');
  const badge = document.getElementById('lootBadge');
  if (!wrap) return;
  const pending = (list || []).filter((x) => x.status === 'pending');

  if (badge) {
    if (pending.length > 0) {
      badge.textContent = String(pending.length);
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  if (!list?.length) {
    wrap.innerHTML = `<div class="tinybars">No loot boxes yet.</div>`;
    return;
  }

  wrap.innerHTML = list
    .map(
      (lb) => `
      <div class="row">
        <div>
          <div>${capitalize(lb.rarity)} Box ${
        lb.status === 'pending' ? '— <em>Unopened</em>' : '— Opened'
      }</div>
          <div class="meta">${new Date(lb.created_at).toLocaleString()}</div>
        </div>
        <div>
          ${
            lb.status === 'pending'
              ? `<button class="btn-ghost" data-open-loot="${lb.id}">Open</button>`
              : ``
          }
        </div>
      </div>`
    )
    .join('');
}

async function fetchAwardsAndLoot(characterId) {
  const client = window.sb;

  // Achievements unchanged
  const { data: achievements = [] } = await client
    .from('achievements')
    .select('id, title, description, awarded_at')
    .eq('character_id', characterId)
    .order('awarded_at', { ascending: false });

  // Loot boxes: be defensive about column names
  const { data: lootRaw = [], error: lootErr } = await client
    .from('loot_boxes')
    .select('*')
    .eq('character_id', characterId);

  if (lootErr) {
    console.warn('[loot] fetch error', lootErr);
  }

  const pickDate = (row) =>
    row.created_at ||
    row.created ||
    row.inserted_at ||
    row.createdAt ||
    row.createdat ||
    null;

  const isOpened = (row) =>
    !!(row.opened_at || row.openedAt) ||
    String(row.status || '').toLowerCase() === 'opened';

  const tier = (row) => row.tier || row.rarity || row.box_tier || 'common';

  const loot = (lootRaw || [])
    .map((lb) => ({
      id: lb.id,
      rarity: tier(lb),
      status: isOpened(lb) ? 'opened' : 'pending',
      created_at: pickDate(lb),
    }))
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  return { awards: achievements, loot };
}

async function renderAwardsAndLoot(characterId) {
  const { awards, loot } = await fetchAwardsAndLoot(characterId);
  renderAwardsList(awards);
  renderLootList(loot);
}

function subscribeAwardsAndLoot(characterId) {
  // Achievements
  window.sb
    .channel('achievements:' + characterId)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'achievements',
        filter: `character_id=eq.${characterId}`,
      },
      async () => {
        await renderAwardsAndLoot(characterId);
      }
    )
    .subscribe();

  // Loot boxes
  window.sb
    .channel('loot_boxes:' + characterId)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'loot_boxes',
        filter: `character_id=eq.${characterId}`,
      },
      async () => {
        await renderAwardsAndLoot(characterId);
      }
    )
    .subscribe();
}

// ================= EXPERIENCES HOOK (still keep the listener) =================
window.addEventListener('character:ready', (ev) => {
  const ch = ev.detail || {};
  const sb = window.sb;

  const chId = ch.id ?? ch.character_id;
  console.log('[xp] character:ready', { hasSb: !!sb, chId });

  if (!document.getElementById('xpList')) {
    console.warn('[xp] #xpList missing in DOM');
    return;
  }
  if (!sb || !chId) return;

  // Opportunistic load; the explicit boot in init() (below) guarantees it anyway
  window.App?.Features?.experience?.loadExperiences?.(sb, chId);

  // Realtime (clean old channel if any)
  window.AppState = window.AppState || {};
  if (window.AppState.xpChannel) {
    try {
      sb.removeChannel(window.AppState.xpChannel);
    } catch {}
  }
  window.AppState.xpChannel =
    window.App?.Features?.experience?.subscribeExperiences?.(sb, chId) || null;
});

// ================= EQUIP FLOW + ABILITIES =================
async function handleAbilityOnEquip(item, slot) {
  if (!item?.ability_id) return;
  const client = window.sb;
  const chId = window.AppState.character.id;

  await client
    .from('character_abilities')
    .delete()
    .eq('character_id', chId)
    .eq('slot', slot);
  await client.from('character_abilities').insert({
    character_id: chId,
    slot,
    ability_id: item.ability_id,
  });
}

async function equipFromInventory(lineId) {
  const client = window.sb;
  const chId = window.AppState.character.id;

  const { data: line, error: qErr } = await client
    .from('character_items')
    .select(
      'id, item_id, qty, item:items(id, name, slot, armor_value, damage, ability_id)'
    )
    .eq('id', lineId)
    .maybeSingle();

  if (qErr || !line) {
    console.warn('[equip] line missing', qErr);
    return;
  }
  const item = line.item;
  const slot = item?.slot;
  if (!slot) {
    console.warn('[equip] item has no slot');
    return;
  }

  await client
    .from('character_equipment')
    .delete()
    .eq('character_id', chId)
    .eq('slot', slot);

  const isArmorSlot = ['head', 'chest', 'legs', 'hands', 'feet'].includes(slot);
  await client.from('character_equipment').insert({
    character_id: chId,
    slot,
    item_id: item.id,
    slots_remaining: Number(item?.armor_value ?? 0) || 0,
    exo_left: isArmorSlot ? 1 : 0,
  });

  await handleAbilityOnEquip(item, slot);

  const nextQty = Math.max(0, Number(line.qty ?? 1) - 1);
  if (nextQty === 0) {
    await client.from('character_items').delete().eq('id', line.id);
  } else {
    await client
      .from('character_items')
      .update({ qty: nextQty })
      .eq('id', line.id);
  }

  await App.Features.equipment.load(chId);
  await App.Features.equipment.computeAndRenderArmor(chId);
  await App.Features.inventory.load(chId, {
    onEquip: equipFromInventory,
    onAdjustQty: adjustNonEquipQty,
  });
  await App.Features.abilities.render?.(chId);
  await renderActiveWeapons();
}
window.equipFromInventory = equipFromInventory;

// ================= NON-EQUIPPABLES =================
async function addInventoryItemById(itemId, delta) {
  const sb = window.sb;
  const chId = AppState.character.id;
  await App.Logic.inventory.addById(sb, chId, itemId, delta);
}

async function populateNonEquipPicker() {
  const client = window.sb;
  const sel = document.getElementById('invAddItem');
  const btn = document.getElementById('invAddPlus');
  if (!sel || !btn) return;

  const { data, error } = await client
    .from('items')
    .select('id, name')
    .is('slot', null)
    .order('name', { ascending: true });
  if (error) {
    console.warn('[invAdd] items error', error);
    return;
  }

  sel.innerHTML = (data || [])
    .map((i) => `<option value="${i.id}">${i.name}</option>`)
    .join('');
  btn.onclick = async () => {
    const itemId = sel.value;
    if (!itemId) return;
    await addInventoryItemById(itemId, +1);
    await App.Features.inventory.load(AppState.character.id, {
      onEquip: equipFromInventory,
      onAdjustQty: adjustNonEquipQty,
    });
  };
}

async function adjustNonEquipQty(itemId, delta) {
  await addInventoryItemById(itemId, delta);
  await App.Features.inventory.load(AppState.character.id, {
    onEquip: equipFromInventory,
    onAdjustQty: adjustNonEquipQty,
  });
}
window.adjustNonEquipQty = adjustNonEquipQty;

async function doAddNameBox() {
  const nameEl = document.getElementById('addItemName');
  const qtyEl = document.getElementById('addItemQty');
  const btn = document.getElementById('btnAddItem');
  if (!nameEl || !qtyEl || !btn) return;

  const name = (nameEl.value || '').trim();
  const qty = Math.max(1, Number(qtyEl.value || 1));
  if (!name) {
    setText?.('msg', 'Enter an item name.');
    nameEl.focus();
    return;
  }

  try {
    btn.disabled = true;
    setText?.('msg', 'Adding…');

    const { item, error } =
      await App.Logic.inventory.findOrCreateNonEquipByName(window.sb, name);
    if (error) {
      setText?.('msg', error);
      return;
    }
    if (!item) {
      setText?.('msg', 'Item not found.');
      return;
    }

    await App.Logic.inventory.addById(
      window.sb,
      AppState.character.id,
      item.id,
      qty
    );

    await App.Features.inventory.load(AppState.character.id, {
      onEquip: equipFromInventory,
      onAdjustQty: adjustNonEquipQty,
    });
    await populateNonEquipPicker();
    nameEl.value = '';
    qtyEl.value = '1';
    setText?.('msg', '');
    nameEl.focus();
  } catch (err) {
    console.error('[add-box] unexpected error', err);
    setText?.('msg', 'Add failed.');
  } finally {
    btn.disabled = false;
  }
}

// ================= ACTIVE WEAPONS CARD =================
async function renderActiveWeapons() {
  const client = window.sb;
  const ch = AppState.character;
  const { data } = await client
    .from('character_equipment')
    .select('slot, item:items(name, damage)')
    .eq('character_id', ch.id)
    .in('slot', ['weapon', 'offhand']);

  const root = document.getElementById('activeWeapons');
  const empty = document.getElementById('weaponsEmpty');
  if (!root) return;

  root.innerHTML = '';
  const rows = data || [];
  if (!rows.length) {
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  rows.forEach((r) => {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<div>${(r.slot || '').toUpperCase()}: ${
      r.item?.name || '—'
    } <span class="muted mono">${r.item?.damage ?? ''}</span></div>`;
    root.appendChild(row);
  });
}

// ================= EXO FAILSAFE =================
async function ensureExoRowsForAllSlots() {
  const sb = window.sb;
  const ch = AppState.character;
  const ARMOR_SLOTS = ['head', 'chest', 'legs', 'hands', 'feet'];

  const { data: existing, error: readErr } = await sb
    .from('character_equipment')
    .select('slot')
    .eq('character_id', ch.id)
    .in('slot', ARMOR_SLOTS);

  if (readErr) {
    console.warn('[rest] exo rows read error', readErr);
    return {
      ok: false,
      created: 0,
      missing: ARMOR_SLOTS.slice(),
      reason: 'read',
      error: readErr,
    };
  }

  const have = new Set((existing || []).map((r) => r.slot));
  const missing = ARMOR_SLOTS.filter((s) => !have.has(s));
  if (!missing.length) return { ok: true, created: 0, missing: [] };

  const inserts = missing.map((slot) => ({
    character_id: ch.id,
    slot,
    item_id: null,
    slots_remaining: 0,
    exo_left: 1,
  }));
  const { error: insErr } = await sb
    .from('character_equipment')
    .insert(inserts);
  if (insErr) {
    console.warn('[rest] exo rows insert error', insErr, { inserts });
    return { ok: false, created: 0, missing, reason: 'insert', error: insErr };
  }
  return { ok: true, created: missing.length, missing: [] };
}

// ================= BUTTON WIRING =================
function wireHpAndHope() {
  document
    .getElementById('btnHpPlus')
    ?.addEventListener('click', () => adjustHP(+1));
  document
    .getElementById('btnHpMinus')
    ?.addEventListener('click', () => adjustHP(-1));
  document
    .getElementById('btnHopePlus')
    ?.addEventListener('click', () => adjustHope(+1));
  document
    .getElementById('btnHopeMinus')
    ?.addEventListener('click', () => adjustHope(-1));
}

// Delegated click handlers
document.addEventListener('click', async (e) => {
  if (!(e.target instanceof Element)) return;

  // Add item (by name box)
  if (e.target.closest('#btnAddItem')) {
    e.preventDefault();
    doAddNameBox();
    return;
  }

  // Open loot box
  const openBtn = e.target.closest('[data-open-loot]');
  if (openBtn) {
    e.preventDefault();
    const lootId = openBtn.getAttribute('data-open-loot');
    if (lootId) App?.Features?.awards?.openLootBox?.(lootId);
    return;
  }

  // ==== Damage Calculator modal ====
  const dmgOpen = e.target.closest('#btnDamageCalc');
  const dmgClose = e.target.closest('#btnCloseModal');
  const dmgCalc = e.target.closest('#btnCalc');
  const dmgApply = e.target.closest('#btnApplyDamage');

  if (dmgOpen || dmgClose || dmgCalc || dmgApply) {
    e.preventDefault();
    const back = document.getElementById('modalBack');
    const input = document.getElementById('calcDamage');
    const result = document.getElementById('calcResult');

    if (dmgOpen) {
      back?.classList.add('show');
      return;
    }
    if (dmgClose) {
      back?.classList.remove('show');
      return;
    }

    const n = Math.max(0, Number(input?.value || 0));

    // Preview only
    if (dmgCalc) {
      const chId = AppState?.character?.id;
      const prev = await App.Logic.combat.previewHit(window.sb, chId, n);
      if (result)
        result.textContent = `Hit ${prev.amount} → HP -${prev.hpLoss} · 1 armor loss`;
      return;
    }

    // Apply
    if (dmgApply) {
      const ch = AppState?.character;
      const out = await App.Logic.combat.applyHit(window.sb, ch, n);
      if (typeof renderHP === 'function') renderHP(ch);
      await App.Features.equipment.computeAndRenderArmor(ch.id);
      await App.Features.equipment.load(ch.id);
      setText?.('msg', `Took -${out.hpLoss} HP · 1 strip`);
      back?.classList.remove('show');
      return;
    }
  }
});

// ================= TABS =================
(function setupTabs() {
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('.tab');
    if (!t) return;
    if (t.tagName === 'A' || t.hasAttribute('href')) e.preventDefault();

    const tabName = t.dataset.page || t.dataset.tab;
    if (!tabName) return;

    document
      .querySelectorAll('.tab')
      .forEach((x) => x.classList.toggle('active', x === t));
    const pageId = `page-${tabName}`;
    document
      .querySelectorAll('.page')
      .forEach((p) => p.classList.toggle('active', p.id === pageId));

    const id = window.AppState?.character?.id;
    if (!id) return;

    try {
      if (tabName === 'inventory') {
        await App.Features.inventory.load(id, {
          onEquip: equipFromInventory,
          onAdjustQty: adjustNonEquipQty,
        });
      } else if (tabName === 'equipment') {
        await App.Features.equipment.load?.(id);
        await App.Features.equipment.computeAndRenderArmor?.(id);
      } else if (tabName === 'abilities') {
        await App.Features.abilities.render?.(id);
      } else if (tabName === 'awards') {
        await App.Features.awards.render?.(id);
      }
    } catch (err) {
      console.error('[tabs] error while rendering tab', tabName, err);
      setText?.('msg', `Failed to load ${tabName} tab.`);
    }
  });

  const initiallyActive = document.querySelector('.tab.active');
  if (initiallyActive) initiallyActive.click();
})();

// ================= INIT HELPERS (Experiences boot) =================
async function bootExperiences(chId) {
  const list = document.getElementById('xpList');
  if (!list || !chId) return;

  const ok = await waitFor(
    () => !!window.sb && !!window.App?.Features?.experience?.loadExperiences
  );

  if (!ok) {
    console.warn('[xp] Not ready after wait (sb/feature missing)');
    list.innerHTML = `
      <div class="xp-row xp-empty"><span>Supabase or XP feature not ready</span><span></span><span class="xp-notch" aria-hidden="true"></span>
      </div>`;
    return;
  }

  const sb = window.sb;
  // Load + subscribe (this is the guaranteed path)
  try {
    await window.App.Features.experience.loadExperiences(sb, chId);

    // Reset previous channel if any
    window.AppState = window.AppState || {};
    if (window.AppState.xpChannel) {
      try {
        sb.removeChannel(window.AppState.xpChannel);
      } catch {}
    }
    window.AppState.xpChannel =
      window.App.Features.experience.subscribeExperiences?.(sb, chId) || null;
  } catch (e) {
    console.warn('[xp] boot load failed', e);
    list.innerHTML = `
      <div class="xp-row xp-empty"><span>Error loading</span><span></span><span class="xp-notch" aria-hidden="true"></span></div>`;
  }
}

// ================= INIT =================
window.addEventListener('character:ready', (e) => {
  const ch = e.detail;
  console.log('[character:ready]', { id: ch?.id });
  renderHP(ch);
  renderHope(ch);
  App?.Features?.equipment?.computeAndRenderArmor?.(ch.id);
  App?.Features?.awards?.subscribe?.(ch.id);
  App?.Features?.awards?.render?.(ch.id);
});

async function init() {
  if (window.__CHAR_SHEET_INIT_DONE) return;
  window.__CHAR_SHEET_INIT_DONE = true;

  const client = window.sb;
  if (!client) {
    setText?.('msg', 'Supabase client not initialized.');
    return;
  }

  const { data: { user } = {}, error: userErr } = await client.auth.getUser();
  console.log('[auth] getUser', { user, userErr });
  if (!user) {
    setText?.('msg', 'Not logged in.');
    return;
  }

  const { data: c, error: charErr } = await client
    .from('characters')
    .select(
      'id,user_id,name,race,class,level,evasion,hp_current,hp_total,dmg_minor,dmg_major,dmg_severe,hope_points,exoskin_slots_max,exoskin_slots_remaining,notes'
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (charErr || !c) {
    setText?.('msg', charErr?.message || 'No character.');
    return;
  }

  window.AppState.user = user;
  setCharacter(c); // fires character:ready (best-effort)

  // stats (traits)
  try {
    const { data: statsRow, error: statsErr } = await client
      .from('character_stats')
      .select('*')
      .eq('character_id', c.id)
      .maybeSingle();
    if (statsErr) setText?.('msg', 'Error loading stats: ' + statsErr.message);
    else renderAllTraits?.(statsRow || {});
  } catch (e) {
    console.warn('[stats] unexpected', e);
  }

  // realtime + initial awards/loot render
  subscribeAwardsAndLoot(c.id);
  await renderAwardsAndLoot(c.id);

  // header/meta
  setText?.('charName', c.name ?? '—');
  setText?.('charRace', c.race ?? '—');
  setText?.('charClass', c['class'] ?? '—');
  setText?.('charLevelNum', c.level ?? '—');
  setText?.('evasion', c.evasion ?? '—');
  setText?.('ownerEmail', user.email || '—');
  setText?.('ownerId', c.user_id || '—');
  setText?.('charId', c.id || '—');
  setText?.('hpCurrent', c.hp_current ?? 0);
  setText?.('hpTotal', c.hp_total ?? 0);
  setText?.('thMinor', c.dmg_minor ?? '—');
  setText?.('thMajor', c.dmg_major ?? '—');
  setText?.('thSevere', c.dmg_severe ?? '—');
  setText?.('hopeDots', fmtDots?.(c.hope_points ?? 0) ?? '');
  const notesEl = document.getElementById('notes');
  if (notesEl) notesEl.value = c.notes ?? '';

  // features
  await App.Features.inventory.load(c.id, {
    onEquip: equipFromInventory,
    onAdjustQty: adjustNonEquipQty,
  });
  await App.Features.equipment.load(c.id);
  await App.Features.equipment.computeAndRenderArmor(c.id);
  await App.Features.abilities.render?.(c.id);
  await renderActiveWeapons();
  await populateNonEquipPicker();

  // NEW: wire Rests UI (moved to /js/features/rests-ui.js)
  App.Features?.restsUI?.wireRestUI?.();

  // failsafe: ensure exo rows exist (prevents clothing level from dropping to 0)
  await ensureExoRowsForAllSlots();
  await App.Features.equipment.computeAndRenderArmor(c.id);

  // ancillary
  wireNotesSave();
  wireLevelUp();
  wireHpAndHope();

  // ========= GUARANTEED EXPERIENCES BOOT (fix for "stuck on Loading…") =========
  await bootExperiences(c.id);

  // Re-dispatch once so any late-loaded listeners (if script order changes) catch up
  try {
    window.dispatchEvent(new CustomEvent('character:ready', { detail: c }));
  } catch (e) {
    console.warn('[xp] re-dispatch failed', e);
  }

  setText?.('msg', '');
}

// ================= NOTES SAVE =================
function wireNotesSave() {
  document
    .getElementById('btnSaveNotes')
    ?.addEventListener('click', async () => {
      const client = window.sb;
      const ch = AppState.character;
      const notesEl = document.getElementById('notes');
      const notes = notesEl?.value ?? '';
      const { error } = await client
        .from('characters')
        .update({ notes })
        .eq('id', ch.id);
      setText?.('msg', error ? 'Failed to save notes.' : 'Notes saved.');
    });
}

// ================= LEVEL UP (stub) =================
function wireLevelUp() {
  const openBtn = document.getElementById('btnLevelUp');
  const back = document.getElementById('levelModalBack');
  const closeBtn = document.getElementById('btnCloseLevelModal');
  const confirmBtn = document.getElementById('btnConfirmLevelUp');
  const choiceHp = document.getElementById('luChoiceHp');
  const choiceStat = document.getElementById('luChoiceStat');
  const abilitySel = document.getElementById('luAbilityKey');

  if (!openBtn || !back) return;

  function updateUIForChoice() {
    const statSelected = choiceStat?.checked;
    if (abilitySel) abilitySel.disabled = !statSelected;

    const canConfirm =
      choiceHp?.checked === true ||
      (statSelected &&
        abilitySel &&
        abilitySel.value &&
        abilitySel.value !== '');
    if (confirmBtn) confirmBtn.disabled = !canConfirm;
  }

  openBtn.addEventListener('click', async () => {
    back.classList.add('show');

    const sb = window.sb;
    const ch = window.AppState?.character;
    if (!sb || !ch?.id || !abilitySel) return;

    try {
      const { data: statsRow, error } = await sb
        .from('character_stats')
        .select('*')
        .eq('character_id', ch.id)
        .maybeSingle();

      if (error) {
        console.warn('[levelup] stats read error', error);
        abilitySel.innerHTML = `<option value="">(no stats table)</option>`;
      } else {
        const keys = Object.keys(statsRow || {}).filter((k) => {
          if (
            k === 'id' ||
            k === 'character_id' ||
            k === 'created_at' ||
            k === 'updated_at'
          )
            return false;
          return Number.isFinite(Number(statsRow[k]));
        });

        abilitySel.innerHTML = keys.length
          ? `<option value="">— choose a stat —</option>` +
            keys
              .map(
                (k) => `<option value="${k}">${k.replace(/_/g, ' ')}</option>`
              )
              .join('')
          : `<option value="">(no numeric stats found)</option>`;
      }
    } catch (e) {
      console.warn('[levelup] dropdown populate failed', e);
      abilitySel.innerHTML = `<option value="">(error)</option>`;
    }

    if (abilitySel) abilitySel.value = '';
    if (choiceHp) choiceHp.checked = true;
    if (choiceStat) choiceStat.checked = false;
    if (abilitySel) abilitySel.disabled = true;

    updateUIForChoice();
  });

  choiceHp?.addEventListener('change', updateUIForChoice);
  choiceStat?.addEventListener('change', updateUIForChoice);
  abilitySel?.addEventListener('change', updateUIForChoice);

  closeBtn?.addEventListener('click', () => back.classList.remove('show'));

  confirmBtn?.addEventListener('click', async () => {
    const sb = window.sb;
    const ch = window.AppState?.character;
    if (!sb || !ch?.id) return;

    const takeExtraHp = choiceHp?.checked === true;
    const statKey =
      choiceStat?.checked && abilitySel && abilitySel.value
        ? abilitySel.value
        : '';

    if (!takeExtraHp && !statKey) {
      setText?.('msg', 'Choose one bonus: extra +1 HP or a stat to raise.');
      return;
    }

    const hpGain = 1 + (takeExtraHp ? 1 : 0);
    const nextLevel = Number(ch.level || 1) + 1;

    const prevHpCur = Math.max(0, Number(ch.hp_current ?? 0));
    const prevHpTot = Math.max(0, Number(ch.hp_total ?? 0));
    const nextHpTotal = prevHpTot + hpGain;
    const nextHpCurrent = Math.min(nextHpTotal, prevHpCur + hpGain);

    const { data: charData, error: charErr } = await sb
      .from('characters')
      .update({
        level: nextLevel,
        hp_total: nextHpTotal,
        hp_current: nextHpCurrent,
      })
      .eq('id', ch.id)
      .select('id, level, hp_total, hp_current, dmg_t1, dmg_t2, evasion')
      .single();

    if (charErr) {
      console.error('[levelup] character update failed', charErr);
      setText?.('msg', 'Level up failed.');
      return;
    }

    if (statKey) {
      const { data: statsRow, error: statsErr } = await sb
        .from('character_stats')
        .select('*')
        .eq('character_id', ch.id)
        .maybeSingle();

      if (
        !statsErr &&
        statsRow &&
        Object.prototype.hasOwnProperty.call(statsRow, statKey)
      ) {
        const cur = Number(statsRow[statKey] || 0);
        const updatePayload = {};
        updatePayload[statKey] = cur + 1;

        const { error: bumpErr } = await sb
          .from('character_stats')
          .update(updatePayload)
          .eq('character_id', ch.id);

        if (bumpErr) console.warn('[levelup] stat bump failed', bumpErr);
      } else if (statsErr) {
        console.warn('[levelup] stats read failed', statsErr);
      }
    }

    Object.assign(ch, charData);
    setText?.('hpCurrent', ch.hp_current);
    setText?.('hpTotal', ch.hp_total);
    setText?.('charLevelNum', String(ch.level));
    try {
      renderHP?.(ch);
    } catch (e) {
      console.warn('[renderHP] failed', e);
    }

    if (App.Logic?.evasion?.refreshStatsAndEvasion) {
      await App.Logic.evasion.refreshStatsAndEvasion(sb, ch.id);
    }

    const featMsg = ch.level % 6 === 0 ? ' — Feat unlocked (coming soon)!' : '';
    setText?.(
      'msg',
      `Leveled up to ${ch.level}! (+${hpGain} Max HP, +${hpGain} Current HP)` +
        (statKey ? ` (+1 ${statKey.replace(/_/g, ' ')})` : '') +
        featMsg
    );

    back.classList.remove('show');
  });
}

// ================= KICKOFF =================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

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
  elBar.style.width =
    (total > 0 ? (current / total) * 100 : 0).toFixed(2) + '%';

  const tMinor = Number(ch?.dmg_minor ?? Math.round(total * 0.25));
  const tMajor = Number(ch?.dmg_major ?? Math.round(total * 0.5));
  const tSevere = Number(ch?.dmg_severe ?? Math.round(total * 0.75));
  setText?.('thMinor', tMinor);
  setText?.('thMajor', tMajor);
  setText?.('thSevere', tSevere);
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

  const { data: achievements = [] } = await client
    .from('achievements')
    .select('id, title, description, awarded_at')
    .eq('character_id', characterId)
    .order('awarded_at', { ascending: false });

  const { data: loot = [] } = await client
    .from('loot_boxes')
    .select('id, tier, created_at, opened_at')
    .eq('character_id', characterId)
    .order('created_at', { ascending: false });

  const lootView = (loot || []).map((lb) => ({
    id: lb.id,
    rarity: lb.tier, // renderer expects "rarity" label
    status: lb.opened_at ? 'opened' : 'pending',
    created_at: lb.created_at,
  }));

  return { awards: achievements, loot: lootView };
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
document.addEventListener('click', (e) => {
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

  // Damage Calculator modal (basic)
  const dmgOpen = e.target.closest('#btnDamageCalc');
  const dmgClose = e.target.closest('#btnCloseModal');
  const dmgApply = e.target.closest('#btnApplyDamage');
  const dmgCalc = e.target.closest('#btnCalc');

  if (dmgOpen || dmgClose || dmgApply || dmgCalc) {
    e.preventDefault();
    const back = document.getElementById('modalBack');
    if (dmgOpen) back?.classList.add('show');
    if (dmgClose) back?.classList.remove('show');

    if (dmgCalc) {
      const input = document.getElementById('calcDamage');
      const result = document.getElementById('calcResult');
      const n = Math.max(0, Number(input?.value || 0));
      if (result) result.textContent = `Calculated: ${n}`;
    }
    if (dmgApply) {
      const input = document.getElementById('calcDamage');
      const n = Math.max(0, Number(input?.value || 0));
      if (n) adjustHP(-n);
      back?.classList.remove('show');
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
  setCharacter(c);

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

  openBtn?.addEventListener('click', () => back?.classList.add('show'));
  closeBtn?.addEventListener('click', () => back?.classList.remove('show'));

  confirmBtn?.addEventListener('click', async () => {
    const client = window.sb;
    const ch = window.AppState?.character;
    if (!client || !ch?.id) return;

    const next = Number(ch.level ?? 0) + 1;
    const { data, error } = await client
      .from('characters')
      .update({ level: next })
      .eq('id', ch.id)
      .select('level')
      .single();

    if (error) {
      console.error('[levelup] update failed', error);
      setText?.('msg', 'Level up failed.');
    } else {
      ch.level = data.level;
      setText?.('charLevelNum', String(data.level));
      setText?.('msg', 'Leveled up! (Allocate gains coming soon)');
    }
    back?.classList.remove('show');
  });
}

// ================= KICKOFF =================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

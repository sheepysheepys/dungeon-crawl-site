// /js/character.js
console.log('[character] start', {
  hasApp: !!window.App,
  hasInventory: !!window.App?.Features?.inventory,
  hasSb: !!window.sb,
  hasStripLogic: !!window.App?.Logic?.strip,
  hasInvLogic: !!window.App?.Logic?.inventory,
});

// ================= HP / HOPE =================

// Central way to set the character and notify UI
function setCharacter(ch) {
  window.AppState = window.AppState || {};
  window.AppState.character = ch;
  window.dispatchEvent(new CustomEvent('character:ready', { detail: ch }));
}

// -- RENDERERS --
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

  // Use your existing columns:
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

async function fetchAwardsAndLoot(characterId) {
  // achievements / awards
  const { data: awards, error: aErr } = await sb
    .from('awards')
    .select('id, description, created_at')
    .eq('character_id', characterId)
    .order('created_at', { ascending: false });

  if (aErr) {
    console.error('[awards] fetch', aErr);
    return { awards: [], loot: [] };
  }

  // loot boxes (pending + opened — we’ll badge only pending)
  const { data: loot, error: lErr } = await sb
    .from('loot_boxes')
    .select('id, rarity, status, created_at')
    .eq('character_id', characterId)
    .order('created_at', { ascending: false });

  if (lErr) {
    console.error('[loot] fetch', lErr);
    return { awards, loot: [] };
  }

  return { awards: awards || [], loot: loot || [] };
}

function renderAwardsList(list) {
  const wrap = document.getElementById('awardsList');
  if (!wrap) return;
  if (!list.length) {
    wrap.innerHTML = `<div class="tinybars">No achievements yet.</div>`;
    return;
  }
  wrap.innerHTML = list
    .map(
      (a) => `
    <div class="row">
      <div>
        <div>${
          a.description ? escapeHtml(a.description) : '(Achievement)'
        }</div>
        <div class="meta">${new Date(a.created_at).toLocaleString()}</div>
      </div>
      <div></div>
    </div>
  `
    )
    .join('');
}

function renderLootList(list) {
  const wrap = document.getElementById('lootList');
  const badge = document.getElementById('lootBadge');
  if (!wrap) return;
  const pending = list.filter((x) => x.status === 'pending');

  // badge
  if (badge) {
    if (pending.length > 0) {
      badge.textContent = String(pending.length);
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  if (!list.length) {
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
    </div>
  `
    )
    .join('');
}

async function renderAwardsAndLoot(characterId) {
  const { awards, loot } = await fetchAwardsAndLoot(characterId);
  renderAwardsList(awards);
  renderLootList(loot);
}

// small utils
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

// -- MUTATIONS --
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
    .select('id,hp_current,hp_total,dmg_minor,dmg_major,dmg_severe') // ✅ uses dmg_*
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

// Paint when the character becomes available
window.addEventListener('character:ready', (e) => {
  const ch = e.detail;
  console.log('[character:ready]', { id: ch?.id });
  renderHP(ch);
  renderHope(ch);
  App?.Features?.equipment?.computeAndRenderArmor?.(ch.id);
  App?.Features?.awards?.subscribe?.(ch.id);
  App?.Features?.awards?.render?.(ch.id);
});

// ================= INIT =================
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

  // character
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
  setCharacter(c); // ✅ fires character:ready for paints

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

  function subscribeAwardsAndLoot(characterId) {
    // Awards
    sb.channel('awards:' + characterId)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'awards',
          filter: `character_id=eq.${characterId}`,
        },
        async () => {
          // Update lists/badge if the tab is visible; always update badge
          await renderAwardsAndLoot(characterId);
        }
      )
      .subscribe();

    // Loot boxes
    sb.channel('loot_boxes:' + characterId)
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

  window.addEventListener('character:ready', (e) => {
    const ch = e.detail;
    subscribeAwardsAndLoot(ch.id);
    // Also render so the badge is correct even before visiting the tab
    renderAwardsAndLoot(ch.id);
  });

  // header/meta
  setText?.('charName', c.name ?? '—');
  setText?.('charRace', c.race ?? '—');
  setText?.('charClass', c['class'] ?? '—');
  setText?.('charLevelNum', c.level ?? '—'); // ✅ matches HTML id
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

  await App.Features.inventory.load(c.id, {
    onEquip: equipFromInventory,
    onAdjustQty: adjustNonEquipQty,
  });
  await App.Features.equipment.load(c.id);
  await App.Features.equipment.computeAndRenderArmor(c.id);
  await App.Features.abilities.render?.(c.id);
  await renderActiveWeapons();

  // quick-add dropdown & name box
  await populateNonEquipPicker();

  // wire ancillary
  wireNotesSave();
  wireLevelUp();
  wireRests();
  wireDamageCalc();
  wireHpAndHope();

  setText?.('msg', '');
}

// ================= EQUIP FLOW + ABILITY HOOK =================
async function handleAbilityOnEquip(item, slot) {
  if (!item?.ability_id) return;
  const client = window.sb;
  const chId = window.AppState.character.id;

  // one active ability per slot (replace)
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

  // 1) read the inventory line + item
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

  // 2) clear the slot
  await client
    .from('character_equipment')
    .delete()
    .eq('character_id', chId)
    .eq('slot', slot);

  // 3) insert equipped row (initialize per-slot exo)
  const isArmorSlot = ['head', 'chest', 'legs', 'hands', 'feet'].includes(slot);
  await client.from('character_equipment').insert({
    character_id: chId,
    slot,
    item_id: item.id,
    slots_remaining: Number(item?.armor_value ?? 0) || 0,
    exo_left: isArmorSlot ? 1 : 0,
  });

  // 4) ability: one active per slot
  await handleAbilityOnEquip(item, slot);

  // 5) decrement inventory line (equip one copy)
  const nextQty = Math.max(0, Number(line.qty ?? 1) - 1);
  if (nextQty === 0) {
    await client.from('character_items').delete().eq('id', line.id);
  } else {
    await client
      .from('character_items')
      .update({ qty: nextQty })
      .eq('id', line.id);
  }

  // 6) refresh UI
  await App.Features.equipment.load(chId);
  await App.Features.equipment.computeAndRenderArmor(chId);
  await App.Features.inventory.load(chId, {
    onEquip: equipFromInventory,
    onAdjustQty: adjustNonEquipQty,
  });
  await App.Features.abilities.render?.(chId);
  await renderActiveWeapons();
}
window.equipFromInventory = equipFromInventory; // used by features

// ================= NON-EQUIPPABLE QUICK ADD =================
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

// +/- from inventory list for non-equippables
async function adjustNonEquipQty(itemId, delta) {
  await addInventoryItemById(itemId, delta);
  await App.Features.inventory.load(AppState.character.id, {
    onEquip: equipFromInventory,
    onAdjustQty: adjustNonEquipQty,
  });
}
window.adjustNonEquipQty = adjustNonEquipQty; // used by features

// Add-by-name box → uses logic module
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

// Delegated click handlers (single source of truth)
document.addEventListener('click', (e) => {
  if (!(e.target instanceof Element)) return;

  // =========== Add item ===========
  const addBtn = e.target.closest('#btnAddItem');
  if (addBtn) {
    e.preventDefault();
    doAddNameBox();
    return;
  }

  // =========== HP + / - ===========
  const hpPlus = e.target.closest('#btnHpPlus');
  const hpMinus = e.target.closest('#btnHpMinus');
  if (hpPlus || hpMinus) {
    e.preventDefault();
    adjustHP(hpPlus ? +1 : -1);
    return;
  }

  // =========== Hope + / - ===========
  const hopePlus = e.target.closest('#btnHopePlus');
  const hopeMinus = e.target.closest('#btnHopeMinus');
  if (hopePlus || hopeMinus) {
    e.preventDefault();
    adjustHope(hopePlus ? +1 : -1);
    return;
  }

  // === Open Loot Box ===
  const openBtn = e.target.closest('[data-open-loot]');
  if (openBtn) {
    e.preventDefault();
    const lootId = openBtn.getAttribute('data-open-loot');
    if (lootId) App?.Features?.awards?.openLootBox?.(lootId);
    return;
  }

  // =========== Damage Calculator modal ===========
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
      // run your existing calc code (whatever you currently do in the calcBtn handler)
      // e.g., compute damage preview based on #calcDamage and write to #calcResult
      const input = document.getElementById('calcDamage');
      const result = document.getElementById('calcResult');
      const n = Math.max(0, Number(input?.value || 0));
      if (result) result.textContent = `Calculated: ${n}`;
    }

    if (dmgApply) {
      // run your existing apply code (what you currently do in applyBtn handler)
      const input = document.getElementById('calcDamage');
      const n = Math.max(0, Number(input?.value || 0));
      if (n) adjustHP(-n);
      back?.classList.remove('show');
    }

    return;
  }

  // =========== Rest modal ===========
  const shortRest = e.target.closest('#btnShortRest');
  const longRest = e.target.closest('#btnLongRest');
  const restClose = e.target.closest('#btnCloseRestModal');
  const restConf = e.target.closest('#btnConfirmRest');

  if (shortRest || longRest || restClose || restConf) {
    e.preventDefault();
    if (shortRest) openRestModal('short');
    if (longRest) openRestModal('long');
    if (restClose) closeRestModal();
    if (restConf) {
      // Your existing confirm logic from wireRests confirmBtn handler
      // We mimic your code path: read selected option and adjust HP appropriately
      const checks = Array.from(
        document.querySelectorAll('#restOptions input[type="checkbox"]')
      );
      const recover = checks.filter((c) => c.checked).length;
      if (recover > 0) adjustHP(+recover); // or call your rests logic
      closeRestModal();
    }
    return;
  }
});

// ================= DAMAGE CALCULATOR MODAL =================
function wireDamageCalc() {
  const openBtn = document.getElementById('btnDamageCalc');
  const modal = document.getElementById('modalBack');
  const close = document.getElementById('btnCloseModal');
  const calcBtn = document.getElementById('btnCalc');
  const applyBtn = document.getElementById('btnApplyDamage');
  const input = document.getElementById('calcDamage');
  if (!openBtn || !modal) return;
}
// ---- tiny helpers for rests ----
function roll(n, sides) {
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.floor(Math.random() * sides) + 1;
  return sum;
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function setupChooseLimit(container, max, confirmBtn) {
  const checks = Array.from(
    container.querySelectorAll('input[type="checkbox"]')
  );
  const msg = container.querySelector('.rest-msg');
  function update() {
    const chosen = checks.filter((c) => c.checked).length;
    if (chosen > max) {
      const last = checks.find((c) => c._justClicked);
      if (last) last.checked = false;
    }
    const afterFix = checks.filter((c) => c.checked).length;
    if (afterFix === 0) {
      msg.textContent = `Choose up to ${max}.`;
    } else if (afterFix < max) {
      msg.textContent = `You can choose ${max - afterFix} more.`;
    } else {
      msg.textContent = `You've chosen ${max}.`;
    }
    if (confirmBtn) confirmBtn.disabled = afterFix === 0 || afterFix > max;
    checks.forEach((c) => (c._justClicked = false));
  }
  checks.forEach((c) => {
    c.addEventListener(
      'click',
      () => {
        c._justClicked = true;
        update();
      },
      { capture: true }
    );
    c.addEventListener('change', update);
  });
  update();
}

// ================= HP & HOPE BUTTONS =================
function wireHpAndHope() {
  // HP +/-
  document
    .getElementById('btnHpPlus')
    ?.addEventListener('click', () => adjustHP(+1));
  document
    .getElementById('btnHpMinus')
    ?.addEventListener('click', () => adjustHP(-1));

  // Hope +/-
  document
    .getElementById('btnHopePlus')
    ?.addEventListener('click', () => adjustHope(+1));
  document
    .getElementById('btnHopeMinus')
    ?.addEventListener('click', () => adjustHope(-1));
}

let _restMode = 'short'; // 'short' | 'long'

function openRestModal(mode) {
  _restMode = mode;
  const title = document.getElementById('restModalTitle');
  if (title) title.textContent = mode === 'short' ? 'Short Rest' : 'Long Rest';
  renderRestOptions(mode);
  document.getElementById('restModalBack')?.classList.add('show');
}
function closeRestModal() {
  document.getElementById('restModalBack')?.classList.remove('show');
}

async function renderRestOptions(mode) {
  const root = document.getElementById('restOptions');
  const confirmBtn = document.getElementById('btnConfirmRest');
  if (!root) return;

  const client = window.sb;
  const ch = AppState.character;
  const ARMOR_SLOTS = ['head', 'chest', 'legs', 'hands', 'feet'];

  // (We still fetch equipment; could be used in UI)
  await client
    .from('character_equipment')
    .select(
      'id, slot, item_id, slots_remaining, exo_left, item:items(name, armor_value)'
    )
    .eq('character_id', ch.id)
    .in('slot', ARMOR_SLOTS);

  if (mode === 'short') {
    root.innerHTML = `
      <div class="mono muted rest-msg" style="margin-bottom:6px"></div>
      <label class="row">
        <input id="srHP" type="checkbox" />
        <span>Regain <strong>1d4 HP</strong></span>
      </label>
      <label class="row">
        <input id="srArmor" type="checkbox" />
        <span>Repair <strong>1d4 armor slots</strong> (+1 each, random damaged slots)</span>
      </label>
      <label class="row">
        <input id="srHope" type="checkbox" />
        <span>Gain <strong>+1 Hope</strong> (to max 5)</span>
      </label>
      <label class="row">
        <input id="srExo" type="checkbox" />
        <span>Restore <strong>Exoskin on one slot</strong> (random damaged exo)</span>
      </label>
    `;
  } else {
    root.innerHTML = `
      <div class="mono muted rest-msg" style="margin-bottom:6px"></div>
      <label class="row">
        <input id="lrFullHeal" type="checkbox" />
        <span><strong>Tend to all wounds</strong> (HP → max)</span>
      </label>
      <label class="row">
        <input id="lrRepairAll" type="checkbox" />
        <span><strong>Repair all equipped armor</strong> (does not recreate destroyed armor)</span>
      </label>
      <label class="row">
        <input id="lrHope2" type="checkbox" />
        <span><strong>Gain +2 Hope</strong> (to max 5)</span>
      </label>
      <label class="row" style="align-items:flex-start">
        <input id="lrProject" type="checkbox" />
        <span style="display:inline-block">
          <strong>Work on a project</strong> (+1 tick)<br/>
          <input id="lrProjectName" type="text" placeholder="Project name…" style="margin-top:6px; width:260px"/>
        </span>
      </label>
      <div class="mono muted" style="margin-top:8px">
        Exoskin will be restored on <strong>all 5 armor slots</strong> automatically.
      </div>
    `;
  }

  setupChooseLimit(root, 2, confirmBtn);
}

async function applyShortRestOptions() {
  const sb = window.sb;
  const ch = AppState.character;

  const results = await App.Logic.rests.applyShortRest(sb, ch, {
    hp1d4: document.getElementById('srHP')?.checked,
    repair1d4: document.getElementById('srArmor')?.checked,
    hopePlus1: document.getElementById('srHope')?.checked,
    exoOne: document.getElementById('srExo')?.checked,
  });

  // repaint HP/Hope right away
  setText?.('hpCurrent', ch.hp_current);
  setText?.('hopeDots', fmtDots?.(ch.hope_points) ?? '');

  // armor/exo UI
  await App.Features.equipment.computeAndRenderArmor(ch.id);
  await App.Features.equipment.load(ch.id);

  setText?.('msg', `Short rest: ${results.join(' · ')}`);
}

async function applyLongRestOptions() {
  const sb = window.sb;
  const ch = AppState.character;

  const results = await App.Logic.rests.applyLongRest(sb, ch, {
    fullHeal: document.getElementById('lrFullHeal')?.checked,
    repairAll: document.getElementById('lrRepairAll')?.checked,
    hopePlus2: document.getElementById('lrHope2')?.checked,
    projectName: document.getElementById('lrProject')?.checked
      ? document.getElementById('lrProjectName')?.value || ''
      : '',
  });

  // repaint HP/Hope right away
  setText?.('hpCurrent', ch.hp_current);
  setText?.('hopeDots', fmtDots?.(ch.hope_points) ?? '');

  // armor/exo UI
  await App.Features.equipment.computeAndRenderArmor(ch.id);
  await App.Features.equipment.load(ch.id);

  setText?.('msg', `Long rest: ${results.join(' · ')}`);
}

// Ensure each armor slot has a row (exo-only if needed)
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
  let created = 0;

  if (missing.length) {
    const inserts = missing.map((slot) => ({
      character_id: ch.id,
      slot,
      item_id: null, // exo-only row
      slots_remaining: 0,
      exo_left: 1,
    }));
    const { data: ins, error: insErr } = await sb
      .from('character_equipment')
      .insert(inserts);
    if (insErr) {
      console.warn('[rest] exo rows insert error', insErr, { inserts });
      return {
        ok: false,
        created: 0,
        missing,
        reason: 'insert',
        error: insErr,
      };
    }
    created = (ins && ins.length) || missing.length;
  }

  return { ok: true, created, missing: [] };
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

    if (!client) {
      console.error('[levelup] no supabase client');
      return;
    }
    if (!ch?.id) {
      console.error('[levelup] no character loaded');
      return;
    }

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
      setText?.('charLevelNum', String(data.level)); // ✅ matches HTML
      setText?.('msg', 'Leveled up! (Allocate gains coming soon)');
    }

    back?.classList.remove('show');
  });
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

// ================= TABS (event delegation) =================
(function setupTabs() {
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('.tab');
    if (!t) return;
    e.preventDefault();

    document
      .querySelectorAll('.tab')
      .forEach((x) => x.classList.remove('active'));
    document
      .querySelectorAll('.page')
      .forEach((x) => x.classList.remove('active'));
    t.classList.add('active');

    const tabName = t.dataset.tab;
    document.getElementById('page-' + tabName)?.classList.add('active');

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

// Kickoff
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

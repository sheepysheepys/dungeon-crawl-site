// /js/features/inventory.js
(function (global) {
  const App = (global.App = global.App || { Features: {}, Logic: {} });

  // ----------------- utils -----------------
  function escapeHtml(s) {
    return String(s || '').replace(
      /[&<>"']/g,
      (m) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        }[m])
    );
  }
  const ARMOR_SLOTS = new Set(['head', 'chest', 'legs', 'hands', 'feet']);
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

  // ----------------- wear maps -----------------
  async function fetchWearMaps(sb, chId) {
    // current equipped wear (authoritative when worn)
    const { data: eqRows = [] } = await sb
      .from('character_equipment')
      .select('slot,item_id,slots_remaining')
      .eq('character_id', chId);

    // cached wear when *not* equipped
    const { data: wearRows = [] } = await sb
      .from('character_item_wear')
      .select('item_id,armor_left')
      .eq('character_id', chId);

    const equippedWear = new Map();
    for (const r of eqRows || []) {
      if (r.item_id != null && Number.isFinite(Number(r.slots_remaining))) {
        equippedWear.set(String(r.item_id), Number(r.slots_remaining));
      }
    }
    const cachedWear = new Map();
    for (const r of wearRows || []) {
      if (r.item_id != null && Number.isFinite(Number(r.armor_left))) {
        cachedWear.set(String(r.item_id), Number(r.armor_left));
      }
    }
    return { equippedWear, cachedWear };
  }

  // ----------------- MONEY WIDGET -----------------
  // We keep the Gold item id here so the list can hide it
  let __GOLD_ITEM_ID = null;

  async function wireMoneyWidget() {
    const sb = global.sb;
    const chId = global.AppState?.character?.id;
    if (!sb || !chId) return;

    async function ensureGold() {
      const { data } = await sb
        .from('items')
        .select('id,name,slot')
        .eq('name', 'Gold')
        .is('slot', null)
        .maybeSingle();
      if (data?.id) return data;

      const { data: ins } = await sb
        .from('items')
        .insert({
          name: 'Gold',
          slot: null,
          notes: 'Currency',
          rarity: 'common',
          drop_eligible: false,
        })
        .select('id,name,slot')
        .single();
      return ins;
    }

    const gold = await ensureGold();
    __GOLD_ITEM_ID = gold?.id || null;

    async function readBalance() {
      const { data } = await sb
        .from('character_items')
        .select('qty')
        .eq('character_id', chId)
        .eq('item_id', __GOLD_ITEM_ID)
        .maybeSingle();
      return Math.max(0, Number(data?.qty || 0));
    }

    async function changeBalance(delta) {
      await App.Logic.inventory.addById(sb, chId, __GOLD_ITEM_ID, delta);
      const amt = await readBalance();
      const el = document.getElementById('moneyAmount');
      if (el) el.textContent = String(amt);
    }

    // Show card & paint
    const card = document.getElementById('moneyCard');
    if (card) card.style.display = '';
    const amtEl = document.getElementById('moneyAmount');
    if (amtEl) amtEl.textContent = String(await readBalance());

    // Wire buttons
    document
      .getElementById('btnMoneyMinus10')
      ?.addEventListener('click', () => changeBalance(-10));
    document
      .getElementById('btnMoneyMinus1')
      ?.addEventListener('click', () => changeBalance(-1));
    document
      .getElementById('btnMoneyPlus1')
      ?.addEventListener('click', () => changeBalance(+1));
    document
      .getElementById('btnMoneyPlus10')
      ?.addEventListener('click', () => changeBalance(+10));
  }

  // ----------------- INVENTORY LOAD & RENDER -----------------
  async function load(characterId, handlers = {}) {
    const sb = global.sb;
    if (!sb) return [];

    // Pull inventory (include notes/rarity for meta)
    const { data, error } = await sb
      .from('character_items')
      .select(
        'id,item_id,qty,item:items(id,name,slot,damage,armor_value,ability_id,rarity,notes)'
      )
      .eq('character_id', characterId)
      .order('id', { ascending: true });

    if (error) {
      console.warn('[inventory] query error', error);
      return [];
    }

    const rowsRaw = data || [];

    // Fetch wear maps once for this render
    const { equippedWear, cachedWear } = await fetchWearMaps(sb, characterId);

    // Hide the Gold balance line from the regular inventory sections
    const rows = rowsRaw.filter((r) => {
      if (__GOLD_ITEM_ID && r.item_id === __GOLD_ITEM_ID) return false;
      const nm = (r?.item?.name || '').toLowerCase();
      return nm !== 'gold';
    });

    const root = document.querySelector('#inventoryAllList');
    const empty = document.querySelector('#inventoryEmpty');
    if (!root) return rows;

    if (!rows.length) {
      root.innerHTML = '';
      if (empty) empty.style.display = '';
      return rows;
    }
    if (empty) empty.style.display = 'none';

    // helpers
    const isWeapon = (r) =>
      r.item?.slot === 'weapon' || r.item?.slot === 'offhand';
    const isArmor = (r) => ARMOR_SLOTS.has(r.item?.slot);

    function wearInfoFor(it) {
      if (!it || !ARMOR_SLOTS.has(it.slot)) return null;
      const capVal = Math.max(0, Number(it.armor_value || 0));
      const key = String(it.id);

      // Prefer current equipped wear if currently worn
      let left = equippedWear.has(key) ? equippedWear.get(key) : null;

      // Else fallback to cached wear
      if (left == null && cachedWear.has(key)) left = cachedWear.get(key);

      // Else assume pristine
      if (left == null) left = capVal;

      left = Math.max(0, Math.min(capVal, Number(left)));
      return { left, cap: capVal };
    }

    function renderRow(r) {
      const it = r.item || {};
      const equippable = !!it.slot;
      const name = escapeHtml(it.name || '(Unknown)');
      const qty = Math.max(0, Number(r.qty || 0));

      const metaParts = [];
      if (it.rarity) metaParts.push(`[${escapeHtml(it.rarity)}]`);
      if (it.damage) metaParts.push(`DMG ${escapeHtml(it.damage)}`);
      if (Number(it.armor_value || 0) > 0)
        metaParts.push(`ARM ${Number(it.armor_value)}`);
      if (it.slot) metaParts.push(cap(it.slot));
      const meta = metaParts.length ? ' | ' + metaParts.join(' | ') : '';

      const desc = it.notes ? escapeHtml(it.notes) : 'No description.';
      const wear = wearInfoFor(it);
      const wearPill = wear
        ? `<span class="pill mono" style="margin-left:6px">Wear ${wear.left}/${wear.cap}</span>`
        : '';

      const qtyCtrls = `
        <div class="inv-actions">
          <button class="btn-tiny" data-action="dec" data-item="${
            r.item_id
          }">−1</button>
          <span class="mono" style="min-width:2ch; text-align:center; display:inline-block">${qty}</span>
          <button class="btn-tiny" data-action="inc" data-item="${
            r.item_id
          }">+1</button>
          ${
            equippable
              ? `<button class="btn-tiny btn-accent" data-action="equip" data-line="${r.id}">Equip</button>`
              : ``
          }
        </div>
      `;

      return `
        <div class="inv-row" data-line="${r.id}">
          <div class="inv-main">
            <span class="inv-name" title="${desc}">${name}</span>
            <span class="inv-meta">${meta}</span>
            ${wearPill}
            <span class="spacer"></span>
            ${qtyCtrls}
          </div>
          <div class="inv-desc">${desc}</div>
        </div>
      `;
    }

    const weapons = rows.filter(isWeapon);
    const armor = rows.filter(isArmor);
    const other = rows.filter((r) => !isWeapon(r) && !isArmor(r));

    const section = (title, list) =>
      list.length
        ? `<div class="box" style="margin:12px 0; padding:10px 12px;">
             <h4 style="margin:0 0 6px">${title}</h4>
             ${list.map(renderRow).join('')}
           </div>`
        : '';

    root.innerHTML =
      section('Weapons', weapons) +
      section('Armor', armor) +
      section('Other', other);

    // actions
    root.querySelectorAll('button[data-action="equip"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const lineId = btn.getAttribute('data-line');
        btn.disabled = true;
        try {
          await handlers.onEquip?.(lineId);
        } finally {
          btn.disabled = false;
        }
      });
    });

    root.querySelectorAll('button[data-action="inc"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const itemId = btn.getAttribute('data-item');
        await handlers.onAdjustQty?.(itemId, +1);
      });
    });

    root.querySelectorAll('button[data-action="dec"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const itemId = btn.getAttribute('data-item');
        await handlers.onAdjustQty?.(itemId, -1);
      });
    });

    return rows;
  }

  // ----------------- export -----------------
  App.Features.inventory = { load, wireMoneyWidget };
})(window);

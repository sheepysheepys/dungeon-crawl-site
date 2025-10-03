// /js/features/inventory.js
(function (global) {
  const App = (global.App = global.App || { Features: {}, Logic: {} });

  // Loads and renders inventory. Shows:
  // - Equippables (item.slot present): tiny minus/qty/plus + "Equip" button
  // - Non-equippables (no slot): tiny minus/qty/plus
  async function load(characterId, handlers = {}) {
    const client = global.sb;
    if (!client) return [];
    const { data, error } = await client
      .from('character_items')
      .select(
        'id,item_id,qty,item:items(id,name,slot,damage,armor_value,ability_id)'
      )
      .eq('character_id', characterId)
      .order('id', { ascending: true });

    if (error) {
      console.warn('[inventory] query error', error);
      return [];
    }

    const rows = data || [];
    const root = document.querySelector('#inventoryAllList');
    const empty = document.querySelector('#inventoryEmpty');
    if (!root) return rows;

    if (!rows.length) {
      root.innerHTML = '';
      if (empty) empty.style.display = '';
      return rows;
    }
    if (empty) empty.style.display = 'none';

    root.innerHTML = rows;
    // --- group helpers ---
    const ARMOR_SLOTS = new Set(['head', 'chest', 'legs', 'hands', 'feet']);
    const isWeapon = (r) =>
      r.item?.slot === 'weapon' || r.item?.slot === 'offhand';
    const isArmor = (r) => ARMOR_SLOTS.has(r.item?.slot);

    // reusable row renderer
    function renderRow(r) {
      const equippable = !!r.item?.slot;
      const name = r.item?.name || '(Unknown)';
      const slot = r.item?.slot || '—';
      const qty = Math.max(0, Number(r.qty || 0));

      const meta = r.item?.slot
        ? r.item.slot === 'weapon'
          ? r.item.damage
            ? ` DMG:${r.item.damage}`
            : ''
          : Number(r.item.armor_value || 0) > 0
          ? ` ARM:${r.item.armor_value}`
          : ''
        : '';

      const controls = equippable
        ? `<div class="qty-controls">
         <button class="btn-tiny" data-action="dec" data-item="${r.item_id}">−</button>
         <span class="mono" style="min-width:2ch; text-align:center; display:inline-block">${qty}</span>
         <button class="btn-tiny" data-action="inc" data-item="${r.item_id}">+</button>
         <button class="btn-accent" data-action="equip" data-line="${r.id}">Equip</button>
       </div>`
        : `<div class="qty-controls">
         <button class="btn-tiny" data-action="dec" data-item="${r.item_id}">−</button>
         <span class="mono" style="min-width:2ch; text-align:center; display:inline-block">${qty}</span>
         <button class="btn-tiny" data-action="inc" data-item="${r.item_id}">+</button>
       </div>`;

      return `
    <div class="row" data-line="${r.id}">
      <div>${name} <span class="muted mono">${slot}${
        meta ? ' ·' + meta : ''
      }</span></div>
      <div class="spacer"></div>
      ${controls}
    </div>`;
    }

    // split rows
    const weapons = rows.filter(isWeapon);
    const armor = rows.filter(isArmor);
    const other = rows.filter((r) => !isWeapon(r) && !isArmor(r));

    function section(title, list) {
      if (!list.length) return '';
      return (
        `<h4 class="muted" style="margin:8px 0 4px">${title}</h4>` +
        list.map(renderRow).join('')
      );
    }

    root.innerHTML =
      section('Weapons', weapons) +
      section('Armor', armor) +
      section('Other', other);

    // Wire actions
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

  App.Features.inventory = { load };
})(window);

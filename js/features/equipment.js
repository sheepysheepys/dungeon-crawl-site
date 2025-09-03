// /js/features/equipment.js
(function (App) {
  const client = window.sb;

  const ARMOR_SLOTS = ['head', 'chest', 'legs', 'hands', 'feet'];
  const OTHER_SLOTS = ['weapon', 'offhand', 'accessory1', 'accessory2'];
  const ALL_SLOTS = [...OTHER_SLOTS, ...ARMOR_SLOTS];

  // ------- Data -------
  async function queryEquipment(characterId) {
    const { data, error } = await client
      .from('character_equipment')
      .select(
        'id, slot, item_id, slots_remaining, exo_left, item:items(id, name, slot, armor_value, damage)'
      )
      .eq('character_id', characterId);
    if (error) console.warn('[equipment] query error', error);
    return data || [];
  }

  // ------- Armor topline (Armor card) -------
  function updateArmorTopline(rows) {
    // Exoskin on = count of armor slots where exo_left > 0 (missing row counts as 0)
    const bySlot = Object.fromEntries(ARMOR_SLOTS.map((s) => [s, null]));
    (rows || []).forEach((r) => {
      if (ARMOR_SLOTS.includes(r.slot)) bySlot[r.slot] = r;
    });
    const exoOn = ARMOR_SLOTS.reduce((n, s) => {
      const exo = Number(bySlot[s]?.exo_left ?? 0);
      return n + (exo > 0 ? 1 : 0);
    }, 0);
    const stripped = ARMOR_SLOTS.length - exoOn;

    setText?.('exoOn', exoOn);
    setText?.('strippedPieces', stripped);
  }

  // ------- Render helpers -------
  function protectionBoxes(r) {
    if (!r) return '—'; // fully stripped (no row)
    const armorLeft = Math.max(0, Number(r.slots_remaining || 0));
    const exo = Math.max(0, Number(r.exo_left || 0)) > 0 ? 1 : 0;
    const total = armorLeft + exo;
    return total > 0 ? '■'.repeat(total) : '—';
  }

  function armorSlotCard(slot, row) {
    // Name + buttons
    let title;
    if (!row) {
      title = `${slot.toUpperCase()}: <span class="muted">STRIPPED</span>`;
    } else if (row.item_id) {
      title = `${slot.toUpperCase()}: ${row.item?.name || 'Unknown'}`;
    } else {
      title = `${slot.toUpperCase()}: <span class="muted">Empty</span>`;
    }

    const btn =
      row && row.item_id
        ? `<button class="btn-bad" data-unequip="${slot}">Unequip</button>`
        : '';

    // Protection = armor_left + (exo_left ? 1 : 0)
    const prot = protectionBoxes(row);

    return `
      <div class="slotCard">
        <div class="row">
          <div>${title}</div>
          <div class="spacer"></div>
          ${btn}
        </div>
        <div class="mono muted tinybars">
          <span class="label">Protection:</span> ${prot}
        </div>
      </div>
    `;
  }

  function otherSlotCard(slot, row) {
    if (!row) {
      return `
        <div class="slotCard">
          <div class="row">
            <div>${slot.toUpperCase()}: <span class="muted">Empty</span></div>
          </div>
        </div>
      `;
    }
    const btn = `<button class="btn-bad" data-unequip="${slot}">Unequip</button>`;
    return `
      <div class="slotCard">
        <div class="row">
          <div>${slot.toUpperCase()}: ${row.item?.name || 'Unknown'}</div>
          <div class="spacer"></div>
          ${btn}
        </div>
        ${
          row.item?.damage
            ? `<div class="mono muted tinybars"><span class="label">Damage:</span> ${row.item.damage}</div>`
            : ''
        }
      </div>
    `;
  }

  // ------- Equipment tab rendering -------
  function renderEquipmentList(rows) {
    const root = document.querySelector('#equipmentList');
    const empty = document.querySelector('#equipmentEmpty');
    if (!root) return;

    // Build lookup by slot (ensure all slots are represented)
    const bySlot = Object.fromEntries(ALL_SLOTS.map((s) => [s, null]));
    (rows || []).forEach((r) => {
      if (ALL_SLOTS.includes(r.slot)) bySlot[r.slot] = r;
    });

    // Armor section
    const armorSection = `
      <h4 class="muted" style="margin: 6px 0 8px 0">Armor</h4>
      ${ARMOR_SLOTS.map((s) => armorSlotCard(s, bySlot[s])).join('')}
    `;

    // Other gear section
    const otherSection = `
      <h4 class="muted" style="margin: 14px 0 8px 0">Other Gear</h4>
      ${OTHER_SLOTS.map((s) => otherSlotCard(s, bySlot[s])).join('')}
    `;

    root.innerHTML = armorSection + otherSection;

    if (empty) {
      const anyRows = (rows || []).length > 0;
      empty.style.display = anyRows ? 'none' : '';
    }

    // wire unequip buttons
    root.querySelectorAll('[data-unequip]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await client
          .from('character_equipment')
          .delete()
          .eq('character_id', window.AppState.character.id)
          .eq('slot', btn.getAttribute('data-unequip'));
        await load(window.AppState.character.id); // refresh tab
        await computeAndRenderArmor(window.AppState.character.id); // refresh topline
      });
    });
  }

  // ------- Public API -------
  async function computeAndRenderArmor(characterId) {
    const rows = await queryEquipment(characterId);
    updateArmorTopline(rows); // updates Exoskin on / Stripped pieces
    return rows;
  }

  async function load(characterId) {
    const rows = await queryEquipment(characterId);
    updateArmorTopline(rows);
    renderEquipmentList(rows);
    return rows;
  }

  App.Features.equipment = { load, computeAndRenderArmor };
})(window.App);

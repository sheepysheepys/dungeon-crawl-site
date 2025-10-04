(function (App) {
  function sb() {
    return window.sb;
  }

  const ARMOR_SLOTS = ['head', 'chest', 'legs', 'hands', 'feet'];
  // const OTHER_SLOTS = ['weapon', 'offhand', 'accessory1', 'accessory2']; // keep your slots
  const ALL_SLOTS = [...OTHER_SLOTS, ...ARMOR_SLOTS];

  // ------- Data -------
  async function queryEquipment(characterId) {
    const client = sb();
    if (!client) return [];
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
    const armorRows = (rows || []).filter((r) => ARMOR_SLOTS.includes(r.slot));

    // 1) Exo count
    let exoOn = armorRows.reduce(
      (n, r) => n + (Number(r?.exo_left ?? 0) > 0 ? 1 : 0),
      0
    );

    // Fallback: use character.exoskin_slots_remaining when rows are missing or zero
    if (!armorRows.length || exoOn === 0) {
      const ch = window.AppState?.character;
      const fallback = Number(ch?.exoskin_slots_remaining ?? 0);
      if (fallback > 0) exoOn = Math.min(5, fallback);
    }

    const stripped = 5 - exoOn;
    setText?.('exoOn', exoOn);
    setText?.('strippedPieces', stripped);

    // 2) Ticks fill using your CSS (.filled)
    const track = document.querySelector('#armorCard .armor-track');
    if (track) {
      const ticks = Array.from(track.querySelectorAll('.tick')).slice(0, 5);
      ticks.forEach((el, i) => {
        el.classList.toggle('filled', i < exoOn);
      });
    }
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
    // Title
    let title;
    if (!row) {
      title = `${slot.toUpperCase()}: <span class="muted">STRIPPED</span>`;
    } else if (row.item_id) {
      title = `${slot.toUpperCase()}: ${row.item?.name || 'Unknown'}`;
    } else {
      title = `${slot.toUpperCase()}: <span class="muted">Empty</span>`;
    }

    // Button
    const btn = row?.item_id
      ? `<button class="btn-bad" data-unequip="${slot}">Unequip</button>`
      : '';

    // Protection = armor_left + (exo_left ? 1 : 0)
    const prot = protectionBoxes(row);

    // Armor meta
    const meta =
      row?.item?.armor_value != null && Number(row.item.armor_value) > 0
        ? `<div class="mono muted tinybars"><span class="label">Armor:</span> ${row.item.armor_value}</div>`
        : '';

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
        ${meta}
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
    const btn = row?.item_id
      ? `<button class="btn-bad" data-unequip="${slot}">Unequip</button>`
      : '';

    const dmg = row.item?.damage
      ? `<div class="mono muted tinybars"><span class="label">Damage:</span> ${row.item.damage}</div>`
      : '';

    return `
      <div class="slotCard">
        <div class="row">
          <div>${slot.toUpperCase()}: ${row.item?.name || 'Unknown'}</div>
          <div class="spacer"></div>
          ${btn}
        </div>
        ${dmg}
      </div>
    `;
  }

  // ------- Slot persistence helper -------
  async function clearEquipmentSlot(characterId, slot) {
    const client = sb();
    if (!client) return;
    const { error } = await client
      .from('character_equipment')
      .delete()
      .eq('character_id', characterId)
      .eq('slot', slot);
    if (error) console.warn('[equipment] clear slot error', error);
  }

  // ------- Unequip flow (return to inventory, keep EXO) -------
  async function unequipItem(slot) {
    const client = window.sb;
    const ch = window.AppState?.character;
    if (!client || !ch?.id || !slot) return;

    // 1) read current row for the slot
    const { data: eq, error: qErr } = await client
      .from('character_equipment')
      .select('id, item_id, slot, exo_left')
      .eq('character_id', ch.id)
      .eq('slot', slot)
      .maybeSingle();

    if (qErr || !eq || !eq.item_id) {
      console.warn('[unequip] none equipped in slot', slot, qErr);
      return;
    }

    // 2) give the item back to inventory
    await App.Logic.inventory.addById(client, ch.id, eq.item_id, +1);

    // 3) DO NOT DELETE THE ROW — clear item but keep exo_left intact
    const { error: upErr } = await client
      .from('character_equipment')
      .update({ item_id: null, slots_remaining: 0 })
      .eq('id', eq.id);
    if (upErr) console.warn('[unequip] clear item failed', upErr);

    // 4) repaint
    const rows = await queryEquipment(ch.id);
    updateArmorTopline(rows);
    renderEquipmentList(rows);
    App.Features?.EquipmentSilhouette?.updateFromEquipmentRows?.(rows);

    await App.Features.inventory.load(ch.id, {
      onEquip: window.equipFromInventory,
      onAdjustQty: window.adjustNonEquipQty,
    });

    setText?.('msg', `Unequipped from ${slot} (exo preserved)`);
  }

  // ------- Equipment tab rendering -------
  function renderEquipmentList(rows) {
    const root = document.querySelector('#equipmentList');
    const empty = document.querySelector('#equipmentEmpty');
    if (!root) return;

    // Only care about armor slots here
    const ARMOR_SLOTS = ['head', 'chest', 'legs', 'hands', 'feet'];

    // Build lookup just for armor
    const bySlot = Object.fromEntries(ARMOR_SLOTS.map((s) => [s, null]));
    (rows || []).forEach((r) => {
      if (ARMOR_SLOTS.includes(r.slot)) bySlot[r.slot] = r;
    });

    // Armor section only
    const armorSection = `
    <h4 class="muted" style="margin: 6px 0 8px 0">Armor</h4>
    ${ARMOR_SLOTS.map((s) => armorSlotCard(s, bySlot[s])).join('')}
  `;

    root.innerHTML = armorSection;

    if (empty) {
      // "any armor rows" = either an equipped item for a slot OR an existing row for that slot
      const anyArmor = ARMOR_SLOTS.some((s) => !!bySlot[s]);
      empty.textContent = anyArmor ? '' : 'No armor equipped.';
      empty.style.display = anyArmor ? 'none' : '';
    }

    // wire unequip buttons (armor only now)
    root.querySelectorAll('[data-unequip]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const slot = btn.getAttribute('data-unequip');
        await window.unequipSlot?.(slot);
      });
    });
  }

  // ------- Public API -------
  async function computeAndRenderArmor(characterId) {
    const rows = await queryEquipment(characterId);
    updateArmorTopline(rows); // updates Exoskin on / Stripped pieces + ticks
    App.Features?.EquipmentSilhouette?.updateFromEquipmentRows?.(rows);
    return rows;
  }

  async function load(characterId) {
    const rows = await queryEquipment(characterId);
    updateArmorTopline(rows);
    renderEquipmentList(rows);
    App.Features?.EquipmentSilhouette?.updateFromEquipmentRows?.(rows);
    return rows;
  }

  App.Features = App.Features || {};
  App.Features.equipment = { load, computeAndRenderArmor };
})(window.App || (window.App = {}));

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
        'id, slot, item_id, slots_remaining, exo_left, rarity, item:items(id, name, slot, armor_value, damage)'
      )
      .eq('character_id', characterId);
    if (error) console.warn('[equipment] query error', error);
    return data || [];
  }

  // ------- Armor topline (Armor card) -------
  function updateArmorTopline(rows) {
    const armorRows = (rows || []).filter((r) =>
      ['head', 'chest', 'legs', 'hands', 'feet'].includes(r.slot)
    );

    // 1) Exoskin count (binary per slot: exo_left > 0)
    const exoOn = armorRows.reduce(
      (n, r) => n + (Number(r?.exo_left ?? 0) > 0 ? 1 : 0),
      0
    );
    const stripped = 5 - exoOn; // 5 armor slots total

    setText?.('exoOn', exoOn);
    setText?.('strippedPieces', stripped);

    // 2) Clothing Level ticks (your HTML has 5 .tick divs)
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
        ? `<button class="btn-bad"
             data-unequip="${slot}"
             data-item-id="${row.item_id}"
             data-item-name="${row.item?.name || ''}"
             data-item-rarity="${row.rarity || 'common'}"
           >Unequip</button>`
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
    const btn = row?.item_id
      ? `<button class="btn-bad"
           data-unequip="${slot}"
           data-item-id="${row.item_id}"
           data-item-name="${row.item?.name || ''}"
           data-item-rarity="${row.rarity || 'common'}"
         >Unequip</button>`
      : '';
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

  // ------- Slot persistence helper -------
  async function saveEquipmentSlot(characterId, slot, clear = true) {
    if (clear) {
      const { error } = await client
        .from('character_equipment')
        .delete()
        .eq('character_id', characterId)
        .eq('slot', slot);
      if (error) console.warn('[equipment] clear slot error', error);
      return;
    }
    // (Optional) implement “set equipment” here when you add equip-by-click.
  }

  // ------- Unequip flow (safe: return to inventory, then clear slot) -------
  async function unequipItem(slot, meta) {
    const ch = window.AppState?.character;
    if (!ch) return;

    const { error: rpcErr } = await client.rpc('inventory_adjust', {
      p_character: ch.id,
      p_item: meta.itemId,
      p_item_name: meta.itemName,
      p_rarity: meta.itemRarity || 'common',
      p_delta: 1,
    });
    if (rpcErr) {
      console.warn('[equipment] inventory_adjust failed', rpcErr);
      setText?.('msg', 'Could not return item to inventory.');
      return;
    }

    await saveEquipmentSlot(ch.id, slot, true);

    await load(ch.id); // equipment tab
    await computeAndRenderArmor(ch.id); // armor topline
    if (App.Features?.inventory?.load) {
      await App.Features.inventory.load(ch.id); // inventory tab (if mounted)
    }
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
        const slot = btn.getAttribute('data-unequip');
        const meta = {
          itemId: btn.getAttribute('data-item-id'),
          itemName: btn.getAttribute('data-item-name'),
          itemRarity: btn.getAttribute('data-item-rarity') || 'common',
        };
        await unequipItem(slot, meta);
      });
    });
  }

  // ------- Public API -------
  async function computeAndRenderArmor(characterId) {
    const rows = await queryEquipment(characterId);
    updateArmorTopline(rows); // updates Exoskin on / Stripped pieces + ticks
    return rows;
  }

  async function load(characterId) {
    const rows = await queryEquipment(characterId);
    updateArmorTopline(rows);
    renderEquipmentList(rows);
    return rows;
  }

  App.Features = App.Features || {};
  App.Features.equipment = { load, computeAndRenderArmor };
})(window.App || (window.App = {}));

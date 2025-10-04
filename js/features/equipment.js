(function (App) {
  function sb() {
    return window.sb;
  }

  const ARMOR_SLOTS = ['head', 'chest', 'legs', 'hands', 'feet'];

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

    // EXO count
    let exoOn = armorRows.reduce(
      (n, r) => n + (Number(r?.exo_left ?? 0) > 0 ? 1 : 0),
      0
    );

    // Fallback when rows are missing
    if (!armorRows.length || exoOn === 0) {
      const ch = window.AppState?.character;
      const fallback = Number(ch?.exoskin_slots_remaining ?? 0);
      if (fallback > 0) exoOn = Math.min(5, fallback);
    }

    setText?.('exoOn', exoOn);
    setText?.('strippedPieces', Math.max(0, 5 - exoOn));

    // Ensure + fill 5 EXO ticks
    const track = document.querySelector('#armorCard .armor-track');
    if (track) {
      let ticks = Array.from(track.querySelectorAll('.tick'));
      if (ticks.length !== 5) {
        track.innerHTML = '';
        for (let i = 0; i < 5; i++) {
          const el = document.createElement('div');
          el.className = 'tick';
          track.appendChild(el);
        }
        ticks = Array.from(track.querySelectorAll('.tick'));
      }
      ticks.forEach((el, i) => el.classList.toggle('filled', i < exoOn));
    }

    // Total armor boxes left (sum of slots_remaining across equipped armor)
    const armorLeftTotal = armorRows.reduce(
      (sum, r) => sum + Math.max(0, Number(r?.slots_remaining || 0)),
      0
    );
    setText?.('silArmorCount', armorLeftTotal);
  }

  // ------- Render helpers -------
  function armorSlotCard(slot, row) {
    let title;
    if (!row) {
      title = `${slot.toUpperCase()}: <span class="muted">STRIPPED</span>`;
    } else if (row.item_id) {
      title = `${slot.toUpperCase()}: ${row.item?.name || 'Unknown'}`;
    } else {
      title = `${slot.toUpperCase()}: <span class="muted">Empty</span>`;
    }

    const btn = row?.item_id
      ? `<button class="btn-tiny" data-unequip="${slot}">Unequip</button>`
      : '';

    const cap = Number(row?.item?.armor_value ?? 0) || 0;
    const left = Math.max(0, Number(row?.slots_remaining ?? 0));
    const exoLeft = Math.max(0, Number(row?.exo_left ?? 0));

    const strippedNote =
      cap > 0 && left === 0 && exoLeft === 0
        ? `<span class="muted strong">STRIPPED</span>`
        : '';

    const boxes =
      cap > 0
        ? `<span class="boxes">
            ${'■'.repeat(left)}
            <span class="gone">${'■'.repeat(Math.max(0, cap - left))}</span>
           </span>`
        : '—';

    const badge = `<span class="badge ${
      left > 0 ? 'ok' : 'empty'
    }">ARM ${left}/${cap}</span>`;

    return `
      <div class="slotCard">
        <div class="slotHead">
          <div class="slotTitle">${slot.toUpperCase()}:</div>
          <div class="slotName">${
            row?.item?.name || 'None'
          } ${strippedNote}</div>
          <div class="metaRow">
            ${badge}
            ${btn}
          </div>
        </div>
        <div class="mono muted tinybars" style="margin-top:6px">
          <span class="label">Armor:</span> ${boxes}
        </div>
      </div>
    `;
  }

  // ------- Unequip flow (return to inventory, keep EXO, cache wear) -------
  async function unequipItem(slot) {
    const client = sb();
    const ch = window.AppState?.character;
    if (!client || !ch?.id || !slot) {
      console.warn('[unequip] missing client/character/slot', {
        hasClient: !!client,
        chId: ch?.id,
        slot,
      });
      return;
    }

    // 1) read current row for the slot
    const { data: eq, error: qErr } = await client
      .from('character_equipment')
      .select('id, item_id, slot, exo_left, slots_remaining')
      .eq('character_id', ch.id)
      .eq('slot', slot)
      .maybeSingle();

    if (qErr) {
      console.warn('[unequip] equip row read error', qErr);
      setText?.('msg', 'Unequip failed: read error.');
      return;
    }
    if (!eq || !eq.item_id) {
      console.warn('[unequip] none equipped in slot', slot, { eq });
      setText?.('msg', 'Nothing to unequip in that slot.');
      return;
    }

    // 2) STASH wear (so re-equip doesn't refill)
    const armorLeftAtUnequip = Math.max(0, Number(eq?.slots_remaining || 0));
    try {
      await client
        .from('character_item_wear')
        .upsert(
          {
            character_id: ch.id,
            item_id: eq.item_id,
            armor_left: armorLeftAtUnequip,
          },
          { onConflict: 'character_id,item_id' }
        );
    } catch (wearErr) {
      console.warn('[unequip] wear upsert failed (non-fatal)', wearErr);
    }

    // 3) +1 back to inventory (update-or-insert)
    const { data: existing, error: exErr } = await client
      .from('character_items')
      .select('id, qty')
      .eq('character_id', ch.id)
      .eq('item_id', eq.item_id)
      .maybeSingle();
    if (exErr) {
      console.warn('[unequip] inventory read error', exErr);
      setText?.('msg', 'Unequip failed: inventory read.');
      return;
    }
    if (existing?.id) {
      const next = Math.max(0, Number(existing.qty || 0) + 1);
      const { error: upErr } = await client
        .from('character_items')
        .update({ qty: next })
        .eq('id', existing.id);
      if (upErr) {
        console.warn('[unequip] inventory qty update error', upErr);
        setText?.('msg', 'Unequip failed: inventory update.');
        return;
      }
    } else {
      const { error: insErr } = await client.from('character_items').insert({
        character_id: ch.id,
        item_id: eq.item_id,
        qty: 1,
      });
      if (insErr) {
        console.warn('[unequip] inventory insert error', insErr);
        setText?.('msg', 'Unequip failed: inventory insert.');
        return;
      }
    }

    // 4) Clear item but KEEP exo_left (so topline exo remains)
    const { error: clrErr } = await client
      .from('character_equipment')
      .update({ item_id: null, slots_remaining: 0 })
      .eq('id', eq.id);
    if (clrErr) {
      console.warn('[unequip] clear item failed', clrErr);
      setText?.('msg', 'Unequip failed: clear slot.');
      return;
    }

    // 5) repaint (hide card by not rendering empty rows)
    const rows = await queryEquipment(ch.id);
    updateArmorTopline(rows);
    renderEquipmentList(rows);
    App.Features?.EquipmentSilhouette?.updateFromEquipmentRows?.(rows);

    await App.Features.inventory.load(ch.id, {
      onEquip: window.equipFromInventory,
      onAdjustQty: window.adjustNonEquipQty,
    });
    await window.renderActiveWeapons?.();

    setText?.('msg', `Unequipped from ${slot} (exo preserved)`);
  }

  // ------- Equipment tab rendering (ARMOR ONLY) -------
  function renderEquipmentList(rows) {
    const root = document.querySelector('#equipmentList');
    const empty = document.querySelector('#equipmentEmpty');
    if (!root) return;

    // Only armor rows with an equipped item_id
    const armorRowsWithItems = (rows || []).filter(
      (r) => ARMOR_SLOTS.includes(r.slot) && !!r.item_id
    );

    root.innerHTML = `
      <h4 class="muted" style="margin: 6px 0 8px 0">Armor</h4>
      ${armorRowsWithItems.map((r) => armorSlotCard(r.slot, r)).join('')}
    `;

    if (empty) {
      const anyArmor = armorRowsWithItems.length > 0;
      empty.textContent = anyArmor ? '' : 'No armor equipped.';
      empty.style.display = anyArmor ? 'none' : '';
    }

    // wire unequip buttons
    root.querySelectorAll('[data-unequip]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const slot = btn.getAttribute('data-unequip');
        await unequipItem(slot);
      });
    });
  }

  // ------- Public API -------
  async function computeAndRenderArmor(characterId) {
    const rows = await queryEquipment(characterId);
    updateArmorTopline(rows);
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
  App.Features.equipment = {
    load,
    computeAndRenderArmor,
    unequipSlot: unequipItem,
  };
})(window.App || (window.App = {}));

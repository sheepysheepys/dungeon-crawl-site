(function (App) {
  function sb() {
    return window.sb;
  }

  const ARMOR_SLOTS = ['head', 'chest', 'legs', 'hands', 'feet'];

  function cacheKey(characterId) {
    return String(characterId || '');
  }

  function getCachedRows(characterId) {
    const key = cacheKey(characterId);
    if (
      window.AppState?.equipmentRows &&
      window.AppState.equipmentRowsFor === key
    ) {
      return window.AppState.equipmentRows;
    }
    return null;
  }

  function setCachedRows(characterId, rows) {
    window.AppState = window.AppState || {};
    window.AppState.equipmentRows = rows || [];
    window.AppState.equipmentRowsFor = cacheKey(characterId);
  }

  function invalidateCache() {
    if (!window.AppState) return;
    window.AppState.equipmentRows = null;
    window.AppState.equipmentRowsFor = null;
  }

  async function upsertWearSafe(client, chId, itemId, armorLeft) {
    try {
      await client
        .from('character_item_wear')
        .upsert(
          {
            character_id: chId,
            item_id: itemId,
            armor_left: Math.max(0, Number(armorLeft || 0)),
          },
          { onConflict: 'character_id,item_id' }
        );
    } catch (e) {
      console.warn('[wear] upsert skipped', e?.code || e?.message || e);
    }
  }

  async function queryEquipment(characterId, { force = false } = {}) {
    const cached = !force ? getCachedRows(characterId) : null;
    if (cached) return cached;

    const client = sb();
    if (!client) return [];
    const { data, error } = await client
      .from('character_equipment')
      .select(
        'id, slot, item_id, slots_remaining, exo_left, item:items(id, name, slot, armor_value, damage)'
      )
      .eq('character_id', characterId);
    if (error) console.warn('[equipment] query error', error);
    const rows = data || [];
    setCachedRows(characterId, rows);
    return rows;
  }

  async function ensureExoRows(characterId, rows) {
    const client = sb();
    if (!client || !characterId) return rows || [];

    const current = rows || (await queryEquipment(characterId));
    const have = new Set(current.map((r) => r.slot));
    const missing = ARMOR_SLOTS.filter((s) => !have.has(s));
    if (!missing.length) return current;

    const inserts = missing.map((slot) => ({
      character_id: characterId,
      slot,
      item_id: null,
      slots_remaining: 0,
      exo_left: 1,
    }));
    const { error } = await client.from('character_equipment').insert(inserts);
    if (error) {
      console.warn('[equipment] exo row insert error', error);
      return current;
    }

    invalidateCache();
    return queryEquipment(characterId, { force: true });
  }

  function paintEquipment(characterId, rows) {
    updateArmorTopline(rows);
    renderEquipmentList(rows);
    App.Features?.EquipmentSilhouette?.updateFromEquipmentRows?.(rows);
    return rows;
  }

  function updateArmorTopline(rows) {
    const armorRows = (rows || []).filter((r) => ARMOR_SLOTS.includes(r.slot));

    let exoOn = armorRows.reduce(
      (n, r) => n + (Number(r?.exo_left ?? 0) > 0 ? 1 : 0),
      0
    );

    if (!armorRows.length || exoOn === 0) {
      const ch = window.AppState?.character;
      const fallback = Number(ch?.exoskin_slots_remaining ?? 0);
      if (fallback > 0) exoOn = Math.min(5, fallback);
    }

    setText?.('exoOn', exoOn);
    setText?.('layersWorn', `${exoOn}/5 layers worn`);
    setText?.('strippedPieces', Math.max(0, 5 - exoOn));

    App.Features?.dressCode?.onEquipmentPaint?.(armorRows);

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

    const armorLeftTotal = armorRows.reduce(
      (sum, r) => sum + Math.max(0, Number(r?.slots_remaining || 0)),
      0
    );
    setText?.('silArmorCount', armorLeftTotal);
  }

  function armorSlotCard(slot, row) {
    const btn = row?.item_id
      ? `<button class="btn-tiny" data-unequip="${slot}">Unequip</button>`
      : '';

    const cap = Number(row?.item?.armor_value ?? 0) || 0;
    const left = Math.max(0, Number(row?.slots_remaining ?? 0));
    const exoLeft = Math.max(0, Number(row?.exo_left ?? 0));

    const strippedNote =
      row?.item_id && cap > 0 && left === 0
        ? `<span class="muted strong">DEPLETED</span>`
        : exoLeft === 0 && !row?.item_id
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

  async function unequipItem(slot) {
    const client = sb();
    const ch = window.AppState?.character;
    if (!client || !ch?.id || !slot) return;

    const { data: eq, error: qErr } = await client
      .from('character_equipment')
      .select('id, item_id, slot, exo_left, slots_remaining')
      .eq('character_id', ch.id)
      .eq('slot', slot)
      .maybeSingle();

    if (qErr || !eq?.item_id) {
      setText?.('msg', qErr ? 'Unequip failed: read error.' : 'Nothing to unequip in that slot.');
      return;
    }

    const armorLeftAtUnequip = Math.max(0, Number(eq?.slots_remaining || 0));
    await upsertWearSafe(client, ch.id, eq.item_id, armorLeftAtUnequip);

    const { data: existing, error: exErr } = await client
      .from('character_items')
      .select('id, qty')
      .eq('character_id', ch.id)
      .eq('item_id', eq.item_id)
      .maybeSingle();
    if (exErr) {
      setText?.('msg', 'Unequip failed: inventory read.');
      return;
    }
    if (existing?.id) {
      const { error: upErr } = await client
        .from('character_items')
        .update({ qty: Math.max(0, Number(existing.qty || 0) + 1) })
        .eq('id', existing.id);
      if (upErr) {
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
        setText?.('msg', 'Unequip failed: inventory insert.');
        return;
      }
    }

    const { error: clrErr } = await client
      .from('character_equipment')
      .update({ item_id: null })
      .eq('id', eq.id);
    if (clrErr) {
      setText?.('msg', 'Unequip failed: clear slot.');
      return;
    }

    invalidateCache();
    await bootstrap(ch.id, { force: true });

    await App.Features.inventory.load(ch.id, {
      onEquip: window.equipFromInventory,
      onAdjustQty: window.adjustNonEquipQty,
    });
    await window.renderActiveWeapons?.();

    setText?.('msg', `Unequipped from ${slot} (exo preserved)`);
  }

  function renderEquipmentList(rows) {
    const root = document.querySelector('#equipmentList');
    const empty = document.querySelector('#equipmentEmpty');
    if (!root) return;

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

    root.querySelectorAll('[data-unequip]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        await unequipItem(btn.getAttribute('data-unequip'));
      });
    });
  }

  async function bootstrap(characterId, { force = false } = {}) {
    let rows = await queryEquipment(characterId, { force });
    rows = await ensureExoRows(characterId, rows);
    return paintEquipment(characterId, rows);
  }

  async function computeAndRenderArmor(characterId) {
    return bootstrap(characterId);
  }

  async function load(characterId) {
    return bootstrap(characterId);
  }

  async function refresh(characterId) {
    invalidateCache();
    return bootstrap(characterId, { force: true });
  }

  App.Features = App.Features || {};
  App.Features.equipment = {
    load,
    bootstrap,
    refresh,
    computeAndRenderArmor,
    unequipSlot: unequipItem,
    invalidateCache,
  };
})(window.App || (window.App = {}));

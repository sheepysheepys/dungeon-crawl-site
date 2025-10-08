// /js/features/silhouette.js
(function () {
  window.App = window.App || { Features: {}, Logic: {} };

  const SLOTS = ['head', 'chest', 'legs', 'hands', 'feet'];

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  // Map equip slots 1:1 to silhouette slots
  const EQUIP_TO_SIL = {
    head: 'head',
    chest: 'chest',
    legs: 'legs',
    hands: 'hands',
    feet: 'feet',
  };

  // Current visual state per slot: 'armor' | 'exo' | 'none'
  const colorState = Object.fromEntries(SLOTS.map((k) => [k, 'none']));

  // A tiny model so we can compute totals without scraping DOM
  let model = {
    exoAny: 0, // 1 if any exo_left > 0 on any slot
    bySlot: Object.fromEntries(
      SLOTS.map((k) => [k, { equipped: 0, wear: 0, exo: 0 }])
    ),
  };

  // ----- low-level painters -----
  function nodesFor(slot) {
    return $$('.silhouette .overlay .slot-region[data-slot="' + slot + '"]');
  }

  function setStateOnNode(el, state, title) {
    el.classList.remove('state-armor', 'state-exo', 'state-none');
    el.classList.add('state-' + state);
    el.setAttribute('data-state', state);
    if (title) el.setAttribute('title', title);
  }

  function paintColors() {
    for (const slot of SLOTS) {
      const nodes = nodesFor(slot);
      const st = colorState[slot] || 'none';
      const title = `${slot.toUpperCase()}: ${st}`;
      nodes.forEach((n) => setStateOnNode(n, st, title));
      if (nodes.length === 0) {
        // Helpful once; comment out if noisy
        // console.warn(`[silhouette] No SVG nodes with data-slot="${slot}"`);
      }
    }
  }

  function paintTotals() {
    // Armor “count” = number of slots that currently show armor
    const armorCount = SLOTS.reduce(
      (n, k) => n + (colorState[k] === 'armor' ? 1 : 0),
      0
    );

    const exoLeft = model.exoAny ? 1 : 0; // you can change this if you track per-slot exo pips later
    const total = exoLeft + armorCount;

    $('#silExoLeft') && ($('#silExoLeft').textContent = String(exoLeft));
    $('#silArmorCount') &&
      ($('#silArmorCount').textContent = String(armorCount));
    $('#silProtectionTotal') &&
      ($('#silProtectionTotal').textContent = String(total));

    // Optional pips (if you have exactly one exo pip to show)
    $$('.totals .pips .pip').forEach((p, i) =>
      p.classList.toggle('filled', i < exoLeft)
    );
  }

  function updateAll() {
    paintColors();
    paintTotals();
  }

  // ----- PUBLIC: drive from equipment rows (truth from DB) -----
  // rows: [{ slot, item_id, slots_remaining, exo_left }, ...]
  function updateFromEquipmentRows(rows) {
    // reset model and state
    model = {
      exoAny: 0,
      bySlot: Object.fromEntries(
        SLOTS.map((k) => [k, { equipped: 0, wear: 0, exo: 0 }])
      ),
    };
    SLOTS.forEach((k) => (colorState[k] = 'none'));

    const by = {};
    (rows || []).forEach((r) => {
      const sil = EQUIP_TO_SIL[r.slot];
      if (!sil) return;
      const wear = Math.max(0, Number(r?.slots_remaining || 0)); // your “armor slots left”
      const exo = Number(r?.exo_left || 0) > 0 ? 1 : 0;
      const equipped = !!r?.item_id;

      const cur = by[sil] || { wear: 0, exo: 0, equipped: 0 };
      by[sil] = {
        wear: Math.max(cur.wear, wear),
        exo: Math.max(cur.exo, exo),
        equipped: Math.max(cur.equipped, equipped ? 1 : 0),
      };
    });

    // decide: armor (wear>0) > exo > none
    SLOTS.forEach((sil) => {
      const a = by[sil] || { wear: 0, exo: 0, equipped: 0 };
      model.bySlot[sil] = { equipped: a.equipped, wear: a.wear, exo: a.exo };
      colorState[sil] = a.wear > 0 ? 'armor' : a.exo > 0 ? 'exo' : 'none';
      if (a.exo > 0) model.exoAny = 1;
    });

    updateAll();
  }

  // ----- OPTIONAL: query + subscribe helpers (robustness) -----
  async function refresh(sb, chId) {
    try {
      const { data = [], error } = await sb
        .from('character_equipment')
        .select('slot, item_id, slots_remaining, exo_left')
        .eq('character_id', chId)
        .in('slot', SLOTS);

      if (error) throw error;
      updateFromEquipmentRows(data);
    } catch (e) {
      console.warn('[silhouette] refresh error', e);
    }
  }

  let _chan = null;
  function subscribe(sb, chId) {
    if (!sb || !chId) return;
    try {
      if (_chan) sb.removeChannel(_chan);
    } catch {}
    _chan = sb
      .channel('silhouette:' + chId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'character_equipment',
          filter: `character_id=eq.${chId}`,
        },
        () => refresh(sb, chId)
      )
      .subscribe();
  }

  // tiny console helper (kept)
  window.__silAudit = function (detail = false) {
    const out = {};
    for (const s of SLOTS) {
      const nodes = nodesFor(s);
      out[s] = detail
        ? nodes.map((n) => ({
            id: n.id || null,
            ds: n.getAttribute('data-slot'),
            cls: n.className?.baseVal || n.className || null,
          }))
        : nodes.length;
    }
    console.table(
      SLOTS.reduce(
        (m, s) => ((m[s] = Array.isArray(out[s]) ? out[s].length : out[s]), m),
        {}
      )
    );
    return out;
  };

  // init keeps just a first paint (no DOM observers needed)
  function init() {
    updateAll();
  }

  document.addEventListener('DOMContentLoaded', init);

  window.App.Features.EquipmentSilhouette = {
    updateFromEquipmentRows,
    refresh, // call after equip/unequip for instant repaint
    subscribe, // optional: realtime repaint
    init,
  };
})();

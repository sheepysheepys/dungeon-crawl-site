// /js/features/silhouette.js
(function () {
  window.App = window.App || { Features: {}, Logic: {} };

  const SLOTS = ['head', 'chest', 'legs', 'hands', 'feet'];

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  // Current visual state per slot: 'armor' | 'exo' | 'none'
  const colorState = Object.fromEntries(SLOTS.map((k) => [k, 'none']));

  // Simple model used by totals
  let model = {
    exoAny: 0, // 1 if any equipped piece has exo_left > 0
    bySlot: Object.fromEntries(
      SLOTS.map((k) => [k, { equipped: 0, wear: 0, exo: 0 }])
    ),
  };

  // ----- low-level painters -----
  function nodesFor(slot) {
    return $$('.silhouette .overlay .slot-region[data-slot="' + slot + '"]');
  }

  function sanitizeSilhouetteFills() {
    $$('.silhouette .overlay .slot-region').forEach((n) => {
      if (n.hasAttribute('fill')) n.removeAttribute('fill');
      if (n.style && n.style.fill) n.style.removeProperty('fill');
    });
  }

  function paintColors() {
    // Reset everything to NONE + clear stray inline fills
    $$('.silhouette .overlay .slot-region').forEach((el) => {
      el.classList.remove('state-armor', 'state-exo', 'state-none');
      el.setAttribute('data-state', 'none');
      if (el.style && el.style.fill) el.style.removeProperty('fill');
    });

    // Apply desired state per slot
    for (const slot of SLOTS) {
      const st = colorState[slot] || 'none';
      nodesFor(slot).forEach((el) => {
        el.classList.add('state-' + st);
        el.setAttribute('data-state', st);
        el.setAttribute('title', `${slot.toUpperCase()}: ${st}`);
      });
    }
  }

  function paintTotals() {
    // Armor count = number of slots currently showing armor
    const armorCount = SLOTS.reduce(
      (n, k) => n + (colorState[k] === 'armor' ? 1 : 0),
      0
    );

    const exoLeft = model.exoAny ? 1 : 0; // flip to per-slot if you add per-slot pips later
    const total = exoLeft + armorCount;

    const exoEl = $('#silExoLeft');
    const armorEl = $('#silArmorCount');
    const totalEl = $('#silProtectionTotal');

    if (exoEl) exoEl.textContent = String(exoLeft);
    if (armorEl) armorEl.textContent = String(armorCount);
    if (totalEl) totalEl.textContent = String(total);

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

    // consider only equipped records
    const eq = (rows || []).filter((r) => !!r?.item_id);

    const by = {};
    for (const r of eq) {
      const slot = String(r?.slot || '').toLowerCase();
      if (!SLOTS.includes(slot)) continue;

      const wear = Math.max(0, Number(r?.slots_remaining || 0));
      const exo = Math.max(0, Number(r?.exo_left || 0));

      const cur = by[slot] || { wear: 0, exo: 0 };
      by[slot] = {
        wear: Math.max(cur.wear, wear),
        exo: Math.max(cur.exo, exo),
      };
    }

    // decide: armor (wear>0) > exo > none
    for (const slot of SLOTS) {
      const a = by[slot] || { wear: 0, exo: 0 };
      // update internal model (for totals/debug)
      model.bySlot[slot] = {
        equipped: a.wear > 0 || a.exo > 0 ? 1 : 0,
        wear: a.wear,
        exo: a.exo,
      };
      colorState[slot] = a.wear > 0 ? 'armor' : a.exo > 0 ? 'exo' : 'none';
      if (a.exo > 0) model.exoAny = 1;
    }

    updateAll();
  }

  // ----- query + subscribe helpers -----
  async function refresh(sb, chId) {
    try {
      const { data = [], error } = await sb
        .from('character_equipment')
        .select('slot, item_id, slots_remaining, exo_left')
        .eq('character_id', chId)
        .in('slot', SLOTS)
        .not('item_id', 'is', null); // only equipped

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

  // tiny console helper
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

  // init: sanitize SVG fills once, then do a first paint
  function init() {
    sanitizeSilhouetteFills();
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

// /js/features/silhouette.js
(function () {
  window.App = window.App || { Features: {}, Logic: {} };

  const SLOTS = ['head', 'chest', 'legs', 'hands', 'feet'];

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const num = (el) =>
    el
      ? parseInt(String(el.textContent || '').replace(/[^\d-]/g, ''), 10) || 0
      : 0;

  // Map equip slots 1:1 to silhouette slots
  const EQUIP_TO_SIL = {
    head: 'head',
    chest: 'chest',
    legs: 'legs',
    hands: 'hands',
    feet: 'feet',
  };

  // Current visual state per slot
  const colorState = Object.fromEntries(SLOTS.map((k) => [k, 'none'])); // 'armor' | 'exo' | 'none'

  function nodesFor(slot) {
    // The ONLY selector we rely on. Keep it simple.
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

      // Debug if SVG is missing a region
      if (nodes.length === 0) {
        console.warn(`[silhouette] No SVG nodes with data-slot="${slot}"`);
      }
    }
  }

  function paintTotals() {
    const exoLeft = num($('#exoOn'));
    const armorCount = SLOTS.reduce(
      (n, k) => n + (colorState[k] === 'armor' ? 1 : 0),
      0
    );
    const total = exoLeft + armorCount;

    const exoEl = $('#silExoLeft');
    if (exoEl) exoEl.textContent = String(exoLeft);
    const armEl = $('#silArmorCount');
    if (armEl) armEl.textContent = String(armorCount);
    const totEl = $('#silProtectionTotal');
    if (totEl) totEl.textContent = String(total);

    $$('.totals .pips .pip').forEach((p, i) =>
      p.classList.toggle('filled', i < exoLeft)
    );
  }

  function updateAll() {
    paintColors();
    paintTotals();
  }

  // Public: drive from equipment rows (truth from DB)
  // rows: [{ slot, slots_remaining, exo_left }, ...]
  function updateFromEquipmentRows(rows) {
    // reset
    SLOTS.forEach((k) => (colorState[k] = 'none'));

    // aggregate by slot
    const by = {};
    (rows || []).forEach((r) => {
      const sil = EQUIP_TO_SIL[r.slot];
      if (!sil) return;
      const seg = Math.max(0, Number(r?.slots_remaining || 0));
      const exo = Number(r?.exo_left || 0) > 0 ? 1 : 0;
      const cur = by[sil] || { seg: 0, exo: 0 };
      by[sil] = { seg: Math.max(cur.seg, seg), exo: Math.max(cur.exo, exo) };
    });

    // decide: armor > exo > none
    SLOTS.forEach((sil) => {
      const a = by[sil] || { seg: 0, exo: 0 };
      colorState[sil] = a.seg > 0 ? 'armor' : a.exo > 0 ? 'exo' : 'none';
    });

    updateAll();
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

  function init() {
    updateAll();
    const exoNode = $('#exoOn');
    if (exoNode)
      new MutationObserver(paintTotals).observe(exoNode, {
        characterData: true,
        childList: true,
        subtree: true,
      });
  }

  document.addEventListener('DOMContentLoaded', init);

  window.App.Features.EquipmentSilhouette = { updateFromEquipmentRows, init };
})();

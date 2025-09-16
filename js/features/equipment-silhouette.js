// /js/features/silhouette.js
(function () {
  window.App = window.App || { Features: {}, Logic: {} };

  // Primary silhouette slots you want to show:
  const SIL_SLOTS = ['head', 'chest', 'legs', 'hands', 'feet'];

  // Query helpers
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const num = (el) =>
    el ? parseInt(String(el.textContent || '').replace(/[^\d-]/g, ''), 10) || 0 : 0;
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  // ALIASES: color all nodes that represent a logical slot
  const SLOT_SELECTORS = {
    head: [
      '.silhouette .overlay .slot-region[data-slot="head"]',
    ],
    chest: [
      '.silhouette .overlay .slot-region[data-slot="chest"]',
      '.silhouette .overlay .slot-region[data-slot="torso"]',
      '.silhouette .overlay .slot-region[data-slot="body"]',
    ],
    legs: [
      '.silhouette .overlay .slot-region[data-slot="legs"]',
      '.silhouette .overlay .slot-region[data-slot="legL"]',
      '.silhouette .overlay .slot-region[data-slot="legR"]',
      '.silhouette .overlay .slot-region[data-slot="thighs"]',
    ],
    hands: [
      '.silhouette .overlay .slot-region[data-slot="hands"]',
      '.silhouette .overlay .slot-region[data-slot="arms"]',
      '.silhouette .overlay .slot-region[data-slot="armL"]',
      '.silhouette .overlay .slot-region[data-slot="armR"]',
      '.silhouette .overlay .slot-region[data-slot="handL"]',
      '.silhouette .overlay .slot-region[data-slot="handR"]',
      '.silhouette .overlay .slot-region[data-slot="forearms"]',
    ],
    feet: [
      '.silhouette .overlay .slot-region[data-slot="feet"]',
      '.silhouette .overlay .slot-region[data-slot="footL"]',
      '.silhouette .overlay .slot-region[data-slot="footR"]',
      '.silhouette .overlay .slot-region[data-slot="boots"]',
      '.silhouette .overlay .slot-region[data-slot="shoes"]',
    ],
  };

  // Equipment slots → silhouette slots (1:1)
  const EQUIP_TO_SIL = {
    head: 'head',
    chest: 'chest',
    legs: 'legs',
    hands: 'hands',
    feet: 'feet',
  };

  // Three-state color per slot: 'armor' | 'exo' | 'none'
  const colorState = Object.fromEntries(SIL_SLOTS.map((k) => [k, 'none']));

  // (Optional legacy outline names—kept no-op friendly)
  const equippedState = Object.fromEntries(SIL_SLOTS.map((k) => [k, false]));
  const names = Object.fromEntries(SIL_SLOTS.map((k) => [k, null]));

  function partsFor(slot) {
    const sels = SLOT_SELECTORS[slot] || [];
    const nodes = [];
    sels.forEach((sel) => nodes.push(...$$(sel)));
    return Array.from(new Set(nodes));
  }

  function setPartState(el, state, title) {
    if (!el) return;
    el.classList.remove('state-armor', 'state-exo', 'state-none');
    el.classList.add(`state-${state}`);
    el.setAttribute('data-state', state);
    if (title) el.setAttribute('title', title);
  }

  function paintColors() {
    SIL_SLOTS.forEach((slot) => {
      const nodes = partsFor(slot);
      const state = colorState[slot] || 'none';
      const title = `${slot.toUpperCase()}: ${state}`;
      nodes.forEach((n) => setPartState(n, state, title));
    });
  }

  // (Optional) legacy label text if you still use it
  function paintSlotsLegacyLabels() {
    SIL_SLOTS.forEach((slot) => {
      const nodes = partsFor(slot);
      const label = names[slot]
        ? `Over-armor: ${names[slot]}`
        : equippedState[slot]
        ? 'Over-armor equipped'
        : 'Exo/None';
      nodes.forEach((node) => node.setAttribute('title', label));
    });
  }

  function paintTotals() {
    const exo = clamp(num($('#exoOn')), 0, 5);
    const armorCount = SIL_SLOTS.reduce((c, k) => c + (colorState[k] === 'armor' ? 1 : 0), 0);
    const protection = exo + armorCount;

    $('#silExoLeft')?.textContent = String(exo);
    $('#silArmorCount')?.textContent = String(armorCount);
    $('#silProtectionTotal')?.textContent = String(protection);

    const pips = $$('.totals .pips .pip');
    pips.forEach((p, i) => p.classList.toggle('filled', i < exo));

    const totals = $('.totals');
    if (totals) {
      totals.setAttribute('aria-label', 'Protection totals');
      totals.setAttribute('data-exo', String(exo));
      totals.setAttribute('data-armor', String(armorCount));
      totals.setAttribute('data-protection', String(protection));
    }
  }

  function updateAll() {
    paintColors();
    paintSlotsLegacyLabels();
    paintTotals();
  }

  // Public API
  function updateFromEquipmentRows(rows) {
    // reset states
    SIL_SLOTS.forEach((k) => (colorState[k] = 'none'));

    // aggregate by silhouette slot
    const bySil = {};
    (rows || []).forEach((r) => {
      const sil = EQUIP_TO_SIL[r.slot];
      if (!sil) return;
      const seg = Math.max(0, Number(r?.slots_remaining || 0));
      const exo = Number(r?.exo_left || 0) > 0 ? 1 : 0;
      const cur = bySil[sil] || { seg: 0, exo: 0 };
      bySil[sil] = { seg: Math.max(cur.seg, seg), exo: Math.max(cur.exo, exo) };
    });

    // decide visual state per slot (armor overrides exo)
    SIL_SLOTS.forEach((sil) => {
      const agg = bySil[sil] || { seg: 0, exo: 0 };
      colorState[sil] = agg.seg > 0 ? 'armor' : agg.exo > 0 ? 'exo' : 'none';
    });

    updateAll();
  }

  // Optional legacy methods (safe no-ops with new colors)
  function setSlot(slot, equipped, displayName) {
    if (!SIL_SLOTS.includes(slot)) return;
    equippedState[slot] = !!equipped;
    names[slot] = displayName || (equipped ? 'Equipped' : null);
    updateAll();
  }
  function setSlots(map) {
    if (!map) return;
    Object.keys(map).forEach((k) => {
      if (SIL_SLOTS.includes(k)) {
        const v = map[k] || {};
        setSlot(k, !!v.equipped, v.name);
      }
    });
  }
  function clear() {
    SIL_SLOTS.forEach((k) => {
      colorState[k] = 'none';
      equippedState[k] = false;
      names[k] = null;
    });
    updateAll();
  }

  // Keep exo/stripped observers so totals stay live
  function initObservers() {
    const cfg = { characterData: true, childList: true, subtree: true };
    const exoNode = $('#exoOn');
    if (exoNode) new MutationObserver(paintTotals).observe(exoNode, cfg);
    const strippedNode = $('#strippedPieces');
    if (strippedNode) new MutationObserver(paintTotals).observe(strippedNode, cfg);
  }

  function init() {
    updateAll();
    initObservers();
  }

  document.addEventListener('DOMContentLoaded', init);

  window.App.Features.EquipmentSilhouette = {
    init,
    updateFromEquipmentRows, // ← call from equipment.js after fetching rows
    setSlot,                 // legacy
    setSlots,                // legacy
    clear,
    getState() {
      return { colors: { ...colorState }, names: { ...names } };
    },
  };
})();

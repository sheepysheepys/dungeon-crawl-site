(function () {
  window.App = window.App || { Features: {}, Logic: {} };

  const SLOTS = ['head', 'chest', 'arms', 'legs', 'accessory'];
  const $ = (s) => document.querySelector(s);
  const num = (el) =>
    el
      ? parseInt(String(el.textContent || '').replace(/[^\d-]/g, ''), 10) || 0
      : 0;
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  // internal state: which slots are equipped with over-armor (true/false)
  const state = Object.fromEntries(SLOTS.map((k) => [k, false]));
  const names = Object.fromEntries(SLOTS.map((k) => [k, null])); // optional display name

  function paintSlots() {
    SLOTS.forEach((slot) => {
      const node = document.querySelector(
        `.silhouette .slot-region[data-slot="${slot}"]`
      );
      if (!node) return;
      node.classList.toggle('active', !!state[slot]);
      const label = names[slot]
        ? `Over-armor: ${names[slot]}`
        : state[slot]
        ? 'Over-armor equipped'
        : 'Exo only';
      node.setAttribute('title', label);
    });
  }

  function paintTotals() {
    const exo = clamp(num($('#exoOn')), 0, 5); // global exo pieces remaining from your Armor card
    const armorCount = SLOTS.reduce((c, k) => c + (state[k] ? 1 : 0), 0);
    const protection = exo + armorCount;

    const exoEl = $('#silExoLeft');
    if (exoEl) exoEl.textContent = String(exo);
    const armEl = $('#silArmorCount');
    if (armEl) armEl.textContent = String(armorCount);
    const protEl = $('#silProtectionTotal');
    if (protEl) protEl.textContent = String(protection);

    // pips
    const pips = document.querySelectorAll('.totals .pips .pip');
    pips.forEach((p, i) => p.classList.toggle('filled', i < exo));

    // a11y
    const totals = $('.totals');
    if (totals) {
      totals.setAttribute('aria-label', 'Protection totals');
      totals.setAttribute('data-exo', String(exo));
      totals.setAttribute('data-armor', String(armorCount));
      totals.setAttribute('data-protection', String(protection));
    }
  }

  function updateAll() {
    paintSlots();
    paintTotals();
  }

  function setSlot(slot, equipped, displayName) {
    if (!SLOTS.includes(slot)) return;
    state[slot] = !!equipped;
    names[slot] = displayName || (equipped ? 'Equipped' : null);
    updateAll();
  }

  function setSlots(map) {
    if (!map) return;
    Object.keys(map).forEach((k) => {
      if (SLOTS.includes(k)) {
        const v = map[k] || {};
        setSlot(k, !!v.equipped, v.name);
      }
    });
  }

  function clear() {
    SLOTS.forEach((k) => {
      state[k] = false;
      names[k] = null;
    });
    updateAll();
  }

  // Listen to exo changes so totals stay live
  function initObservers() {
    const cfg = { characterData: true, childList: true, subtree: true };
    const exoNode = $('#exoOn');
    if (exoNode) new MutationObserver(paintTotals).observe(exoNode, cfg);
    const strippedNode = $('#strippedPieces');
    if (strippedNode)
      new MutationObserver(paintTotals).observe(strippedNode, cfg);
  }

  // Optional: event API for other modules
  window.addEventListener('equipment:setSlot', (ev) => {
    const { slot, equipped, name } = ev.detail || {};
    setSlot(slot, equipped, name);
  });

  function init() {
    updateAll();
    initObservers();
  }

  document.addEventListener('DOMContentLoaded', init);

  // Export a tiny API so your equip/unequip code can drive it
  window.App.Features.EquipmentSilhouette = {
    init,
    setSlot,
    setSlots,
    clear,
    getState() {
      return { slots: { ...state }, names: { ...names } };
    },
  };
})();

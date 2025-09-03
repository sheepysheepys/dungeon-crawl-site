(function () {
  window.App = window.App || { Features: {}, Logic: {} };

  const $ = (s) => document.querySelector(s);
  const num = (el) =>
    el
      ? parseInt(String(el.textContent || '').replace(/[^\d-]/g, ''), 10) || 0
      : 0;
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  // --- build default slot grid if not present ---
  const DEFAULT_SLOTS = ['head', 'chest', 'arms', 'legs', 'accessory'];

  function ensureSlots() {
    const grid = $('#armorSlots');
    if (!grid || grid.childElementCount) return;

    DEFAULT_SLOTS.forEach((slot) => {
      const row = document.createElement('div');
      row.className = 'slot';
      row.dataset.slot = slot;

      const name = document.createElement('div');
      name.className = 'slot-name';
      name.textContent = slot;

      const item = document.createElement('div');
      item.className = 'item-name empty';
      item.textContent = 'Empty';

      const ac = document.createElement('div');
      ac.className = 'ac-badge mono';
      ac.textContent = 'AC 0';

      row.append(name, item, ac);
      grid.appendChild(row);
    });
  }

  // --- counters (Armor left, Exo left) ---
  function updateCounters() {
    const exo = clamp(num($('#exoOn')), 0, 5); // from your Armor card
    const stripped = clamp(num($('#strippedPieces')), 0, 5);
    const armorLeft = clamp(5 - stripped, 0, 5);

    const exoLeftEl = $('#eqExoLeft');
    const armorLeftEl = $('#eqArmorLeft');
    if (exoLeftEl) exoLeftEl.textContent = String(exo);
    if (armorLeftEl) armorLeftEl.textContent = String(armorLeft);

    // fill mini exo pips
    const pips = document.querySelectorAll('.exo-track .pip');
    pips.forEach((p, i) => p.classList.toggle('filled', i < exo));
  }

  // --- public API to set slots from your existing equip logic ---
  // Example: App.Features.EquipmentUI.setArmorSlot('chest', { name:'Leather Coat', ac:1 })
  function setArmorSlot(slot, data) {
    ensureSlots();
    const row = document.querySelector(`.slot[data-slot="${slot}"]`);
    if (!row) return;
    const itemEl = row.querySelector('.item-name');
    const acEl = row.querySelector('.ac-badge');

    const name = data?.name || 'Empty';
    const ac = Number.isFinite(data?.ac) ? data.ac : 0;

    itemEl.textContent = name;
    itemEl.classList.toggle('empty', name === 'Empty');
    acEl.textContent = `AC ${ac}`;
  }

  function clearArmorSlots() {
    ensureSlots();
    DEFAULT_SLOTS.forEach((s) => setArmorSlot(s, { name: 'Empty', ac: 0 }));
  }

  // observe exo/stripped text changes so counters stay live
  function initObservers() {
    const cfg = { characterData: true, childList: true, subtree: true };
    const watch = (el, fn) => el && new MutationObserver(fn).observe(el, cfg);
    watch($('#exoOn'), updateCounters);
    watch($('#strippedPieces'), updateCounters);
  }

  function init() {
    ensureSlots();
    updateCounters();
    initObservers();
  }

  // export
  window.App.Features.EquipmentUI = {
    init,
    setArmorSlot,
    clearArmorSlots,
    // convenience: bulk set
    setArmorSlots(map) {
      ensureSlots();
      Object.entries(map || {}).forEach(([slot, data]) =>
        setArmorSlot(slot, data)
      );
    },
  };

  document.addEventListener('DOMContentLoaded', init);
})();

// /js/features/silhouette.js
(function () {
  window.App = window.App || { Features: {}, Logic: {} };

  const SIL_SLOTS = ['head', 'chest', 'legs', 'hands', 'feet'];

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const num = (el) => el ? parseInt(String(el.textContent || '').replace(/[^\d-]/g, ''), 10) || 0 : 0;
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  // Be liberal with selectors — include common alternates and loose fallbacks
  const SLOT_SELECTORS = {
    head: [
      '[data-slot="head"]',
      '.slot-region[data-slot="head"]',
      '[id*="head"]',
      '[data-slot*="head"]',
    ].map(s => `.silhouette .overlay ${s}`),

    chest: [
      '[data-slot="chest"]','[data-slot="torso"]','[data-slot="body"]',
      '.slot-region[data-slot="chest"]','.slot-region[data-slot="torso"]',
      '[id*="chest"]','[id*="torso"]','[id*="body"]',
      '[data-slot*="chest"]','[data-slot*="torso"]'
    ].map(s => `.silhouette .overlay ${s}`),

    legs: [
      '[data-slot="legs"]','[data-slot="leg"]',
      '[data-slot="legL"]','[data-slot="legR"]',
      '[data-slot="thighs"]','[data-slot="thighL"]','[data-slot="thighR"]',
      '[data-slot="calfL"]','[data-slot="calfR"]',
      '.slot-region[data-slot="legs"]','.slot-region[data-slot="leg"]',
      '.slot-region[data-slot="legL"]','.slot-region[data-slot="legR"]',
      '[id*="leg"]','[id*="legs"]','[id*="thigh"]','[id*="calf"]',
      '[data-slot*="leg"]','[data-slot*="thigh"]'
    ].map(s => `.silhouette .overlay ${s}`),

    hands: [
      '[data-slot="hands"]','[data-slot="arms"]',
      '[data-slot="armL"]','[data-slot="armR"]',
      '[data-slot="handL"]','[data-slot="handR"]',
      '[data-slot="forearms"]',
      '.slot-region[data-slot="hands"]','.slot-region[data-slot="arms"]',
      '.slot-region[data-slot="handL"]','.slot-region[data-slot="handR"]',
      '[id*="arm"]','[id*="hand"]','[id*="forearm"]',
      '[data-slot*="arm"]','[data-slot*="hand"]'
    ].map(s => `.silhouette .overlay ${s}`),

    feet: [
      '[data-slot="feet"]','[data-slot="footL"]','[data-slot="footR"]',
      '[data-slot="boots"]','[data-slot="shoes"]',
      '.slot-region[data-slot="feet"]','.slot-region[data-slot="footL"]','.slot-region[data-slot="footR"]',
      '[id*="foot"]','[id*="feet"]','[id*="boot"]','[id*="shoe"]',
      '[data-slot*="foot"]'
    ].map(s => `.silhouette .overlay ${s}`),
  };

  const EQUIP_TO_SIL = { head:'head', chest:'chest', legs:'legs', hands:'hands', feet:'feet' };
  const colorState = Object.fromEntries(SIL_SLOTS.map(k => [k, 'none']));

  function partsFor(slot) {
    const sels = SLOT_SELECTORS[slot] || [];
    const nodes = [];
    sels.forEach(sel => nodes.push(...$$(sel)));
    // unique
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
      if (nodes.length === 0) {
        console.warn(`[silhouette] No nodes matched for slot "${slot}". Check data-slot/id in your SVG.`);
      }
      const state = colorState[slot] || 'none';
      const title = `${slot.toUpperCase()}: ${state}`;
      nodes.forEach(n => setPartState(n, state, title));
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
  }

  function updateAll() {
    paintColors();
    paintTotals();
  }

  // rows: [{ slot, slots_remaining, exo_left }]
  function updateFromEquipmentRows(rows) {
    SIL_SLOTS.forEach(k => { colorState[k] = 'none'; });

    const bySil = {};
    (rows || []).forEach((r) => {
      const sil = EQUIP_TO_SIL[r.slot];
      if (!sil) return;
      const seg = Math.max(0, Number(r?.slots_remaining || 0));
      const exo = Number(r?.exo_left || 0) > 0 ? 1 : 0;
      const cur = bySil[sil] || { seg: 0, exo: 0 };
      bySil[sil] = { seg: Math.max(cur.seg, seg), exo: Math.max(cur.exo, exo) };
    });

    SIL_SLOTS.forEach((sil) => {
      const agg = bySil[sil] || { seg: 0, exo: 0 };
      colorState[sil] = agg.seg > 0 ? 'armor' : (agg.exo > 0 ? 'exo' : 'none');
    });

    updateAll();
  }

  // Simple console audit to debug selector coverage
  function __silAudit() {
    const res = {};
    SIL_SLOTS.forEach(slot => {
      const nodes = partsFor(slot);
      res[slot] = nodes.map(n => ({
        tag: n.tagName,
        id: n.id || null,
        ds: n.getAttribute('data-slot') || null,
        classes: n.className?.baseVal || n.className || null
      }));
    });
    console.table({
      head: res.head.length,
      chest: res.chest.length,
      legs: res.legs.length,
      hands: res.hands.length,
      feet: res.feet.length,
    });
    return res;
  }
  window.__silAudit = __silAudit;

  function init() {
    updateAll();
    // keep totals in sync if exo/stripped text changes
    const cfg = { characterData: true, childList: true, subtree: true };
    const exoNode = $('#exoOn');
    if (exoNode) new MutationObserver(paintTotals).observe(exoNode, cfg);
  }

  document.addEventListener('DOMContentLoaded', init);

  window.App.Features.EquipmentSilhouette = {
    init,
    updateFromEquipmentRows,
    getState() { return { colors: { ...colorState } }; }
  };
})();

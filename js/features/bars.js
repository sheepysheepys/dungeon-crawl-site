(function () {
  // namespace safety
  window.App = window.App || { Features: {}, Logic: {} };

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const num = (el) =>
    el
      ? parseInt(String(el.textContent || '').replace(/[^\d-]/g, ''), 10) || 0
      : 0;

  // ---------- HP ----------
  function updateHP() {
    const curEl = document.getElementById('hpCurrent');
    const totEl = document.getElementById('hpTotal');
    const barEl = document.getElementById('hpBar');
    if (!barEl || !curEl || !totEl) return;

    const cur = num(curEl);
    const tot = Math.max(0, num(totEl));
    const pct = tot > 0 ? clamp((cur / tot) * 100, 0, 100) : 0;
    barEl.style.width = pct + '%';

    const track = barEl.parentElement;
    if (track) {
      track.setAttribute('role', 'progressbar');
      track.setAttribute('aria-label', 'HP');
      track.setAttribute('aria-valuemin', '0');
      track.setAttribute('aria-valuemax', String(tot));
      track.setAttribute('aria-valuenow', String(cur));
    }
  }

  // ---------- ARMOR ----------
  function updateArmor() {
    const levelEl = document.getElementById('exoOn'); // remaining pieces 0..5
    const track = document.querySelector('#armorCard .armor-track');
    if (!levelEl || !track) return;

    const ticks = track.querySelectorAll('.tick');
    if (!ticks.length) return;

    // Fill equals remaining exosuit pieces (goes DOWN as you lose pieces)
    const remaining = clamp(num(levelEl), 0, ticks.length);

    // If you prefer to compute from "Pieces Stripped" instead, use this line:
    // const stripped = clamp(num(document.getElementById('strippedPieces')), 0, ticks.length);
    // const remaining = clamp(ticks.length - stripped, 0, ticks.length);

    ticks.forEach((t, i) => t.classList.toggle('filled', i < remaining));

    // a11y
    track.setAttribute('role', 'meter');
    track.setAttribute('aria-label', 'Armor');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', String(ticks.length));
    track.setAttribute('aria-valuenow', String(remaining));
  }

  // ---------- observers ----------
  function initObservers() {
    const cfg = { characterData: true, childList: true, subtree: true };

    const watch = (el, fn) => {
      if (!el) return;
      new MutationObserver(fn).observe(el, cfg);
    };

    watch(document.getElementById('hpCurrent'), updateHP);
    watch(document.getElementById('hpTotal'), updateHP);
    watch(document.getElementById('exoOn'), updateArmor);
    watch(document.getElementById('strippedPieces'), updateArmor);
  }

  function init() {
    updateHP();
    updateArmor();
    initObservers();
  }

  // optional API if you’d rather call updates directly
  window.App.Features.Bars = {
    init,
    updateHP,
    updateArmor,
    setHP(cur, tot) {
      const curEl = document.getElementById('hpCurrent');
      const totEl = document.getElementById('hpTotal');
      if (curEl) curEl.textContent = String(cur);
      if (totEl) totEl.textContent = String(tot);
      updateHP();
    },
    setExo(level) {
      const levelEl = document.getElementById('exoOn');
      if (levelEl) levelEl.textContent = String(level);
      updateArmor();
    },
  };

  document.addEventListener('DOMContentLoaded', init);
})();

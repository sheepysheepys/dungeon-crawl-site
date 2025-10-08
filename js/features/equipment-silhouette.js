// /js/features/silhouette.js
(function () {
  window.App = window.App || { Features: {}, Logic: {} };

  const SLOTS = ['head', 'chest', 'legs', 'hands', 'feet'];

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  // Visual state per slot: 'armor' | 'exo' | 'none'
  const colorState = Object.fromEntries(SLOTS.map((k) => [k, 'none']));

  // Model for totals/debug
  let model = {
    exoCount: 0, // 0..5 (number of slots whose exo_left > 0)
    bySlot: Object.fromEntries(
      SLOTS.map((k) => [k, { equipped: 0, wear: 0, exo: 0 }])
    ),
  };

  // ----- painters -----
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
    // Hard reset every frame
    $$('.silhouette .overlay .slot-region').forEach((el) => {
      el.classList.remove('state-armor', 'state-exo', 'state-none');
      el.setAttribute('data-state', 'none');
      if (el.style && el.style.fill) el.style.removeProperty('fill');
    });

    // Apply by slot
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
    const armorCount = SLOTS.reduce(
      (n, k) => n + (colorState[k] === 'armor' ? 1 : 0),
      0
    );
    const exoLeft = Math.max(0, Math.min(5, Number(model.exoCount || 0))); // 0..5
    const total = exoLeft + armorCount;

    const exoEl = $('#silExoLeft');
    const armorEl = $('#silArmorCount');
    const totalEl = $('#silProtectionTotal');

    if (exoEl) exoEl.textContent = String(exoLeft);
    if (armorEl) armorEl.textContent = String(armorCount);
    if (totalEl) totalEl.textContent = String(total);

    // Fill exo pips (0..5)
    $$('.totals .pips .pip').forEach((p, i) =>
      p.classList.toggle('filled', i < exoLeft)
    );
  }

  function updateAll() {
    paintColors();
    paintTotals();
  }

  // ----- core logic (per-slot) -----
  // rows: may include equipped rows and exo-only rows
  // shape: [{ slot, item_id, slots_remaining, exo_left }, ...]
  function updateFromEquipmentRows(rows) {
    // Reset model/state
    model = {
      exoCount: 0,
      bySlot: Object.fromEntries(
        SLOTS.map((k) => [k, { equipped: 0, wear: 0, exo: 0 }])
      ),
    };
    SLOTS.forEach((k) => (colorState[k] = 'none'));

    // Aggregate by slot
    const agg = {};
    for (const r of rows || []) {
      const slot = String(r?.slot || '').toLowerCase();
      if (!SLOTS.includes(slot)) continue;

      const equipped = !!r?.item_id; // item present
      const wear = equipped ? Math.max(0, Number(r?.slots_remaining || 0)) : 0;
      const exo = Math.max(0, Number(r?.exo_left || 0)); // exo can exist with or without item

      const cur = agg[slot] || { wear: 0, equipped: 0, exo: 0 };
      agg[slot] = {
        wear: Math.max(cur.wear, wear),
        equipped: cur.equipped || (equipped ? 1 : 0),
        exo: Math.max(cur.exo, exo),
      };
    }

    // Decide per-slot state: armor (wear>0 & equipped) > exo (exo>0) > none
    let exoCount = 0;
    for (const slot of SLOTS) {
      const a = agg[slot] || { wear: 0, equipped: 0, exo: 0 };
      model.bySlot[slot] = { equipped: a.equipped, wear: a.wear, exo: a.exo };

      if (a.wear > 0 && a.equipped) {
        colorState[slot] = 'armor';
      } else if (a.exo > 0) {
        colorState[slot] = 'exo';
        exoCount += 1; // 1 per slot that has any exo
      } else {
        colorState[slot] = 'none';
      }
    }
    model.exoCount = exoCount;

    updateAll();
  }

  // ----- DB fetch + realtime -----
  async function refresh(sb, chId) {
    try {
      const { data = [], error } = await sb
        .from('character_equipment')
        .select('slot, item_id, slots_remaining, exo_left')
        .eq('character_id', chId)
        .in('slot', SLOTS); // include exo-only rows too

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

  // init
  function init() {
    sanitizeSilhouetteFills();
    updateAll(); // first paint
  }

  document.addEventListener('DOMContentLoaded', init);

  window.App.Features.EquipmentSilhouette = {
    updateFromEquipmentRows,
    refresh,
    subscribe,
    init,
  };
})();

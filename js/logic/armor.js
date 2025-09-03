// logic/armor.js
(function (App) {
  const STRIP_SLOTS = ['head', 'chest', 'legs', 'hands', 'feet'];

  function normalizeEquipRows(rows) {
    return (rows || []).map((r) => ({
      id: r.id,
      slot: r.slot,
      left: Number(r.slots_remaining ?? 0),
      cap: Number(r.item?.armor_value ?? 0),
      name: r.item?.name || '—',
    }));
  }

  function computeArmorTotals(rows, exoMax, exoLeft) {
    const list = normalizeEquipRows(rows);
    const piecesLeft = list.reduce((s, r) => s + Math.max(0, r.left), 0);
    const piecesMax = list.reduce((s, r) => s + Math.max(0, r.cap), 0);

    const current = piecesLeft + exoLeft;
    const max = piecesMax + exoMax;
    const stripLevel = Math.max(0, max - current);

    const equipped = new Set(list.map((r) => r.slot));
    const piecesStripped = STRIP_SLOTS.filter((s) => !equipped.has(s)).length;

    return {
      list,
      current,
      max,
      stripLevel,
      piecesStripped,
      exo: { exoMax, exoLeft },
    };
  }

  function pickStripCandidate(list) {
    return list.find((r) => r.left > 0) || null; // simple policy
  }

  App.Logic.armor = { STRIP_SLOTS, computeArmorTotals, pickStripCandidate };
})(window.App);

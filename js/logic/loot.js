(function () {
  window.App = window.App || { Features: {}, Logic: {} };

  // ---- RNG: xorshift32 seeded by uuid (deterministic per box) ----
  function seedFromUUID(uuid) {
    const hex =
      String(uuid || '')
        .replace(/-/g, '')
        .slice(0, 8) || 'deadbeef';
    return parseInt(hex, 16) >>> 0;
  }
  function makeRng(seed) {
    let s = seed >>> 0 || 0x9e3779b9;
    return function () {
      // 0..1
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) / 0xffffffff;
    };
  }
  const randInt = (rng, min, max) => Math.floor(rng() * (max - min + 1)) + min;

  // ---- Loot tables (starter set; extend as you like) ----
  const TABLE = {
    common: [
      { item: 'Bandage', weight: 28, qty: [1, 2], rarity: 'common' },
      {
        item: 'Small Healing Salve',
        weight: 22,
        qty: [1, 1],
        rarity: 'common',
      },
      { item: 'Torch', weight: 18, qty: [1, 3], rarity: 'common' },
      { item: 'Rations', weight: 20, qty: [1, 2], rarity: 'common' },
      { item: 'Copper Coins', weight: 12, qty: [6, 18], rarity: 'common' },
    ],
    uncommon: [
      { item: 'Throwing Knife', weight: 18, qty: [1, 2], rarity: 'uncommon' },
      { item: 'Panacea Vial', weight: 12, qty: [1, 1], rarity: 'uncommon' },
      { item: 'Lockpicks', weight: 16, qty: [1, 3], rarity: 'uncommon' },
      { item: 'Silver Coins', weight: 14, qty: [4, 12], rarity: 'uncommon' },
      {
        item: 'Light Armor Patch',
        weight: 12,
        qty: [1, 1],
        rarity: 'uncommon',
      },
      { item: 'Rune Shard', weight: 10, qty: [1, 2], rarity: 'uncommon' },
    ],
    rare: [
      { item: 'Greater Salve', weight: 16, qty: [1, 1], rarity: 'rare' },
      { item: 'Exo-Plate Segment', weight: 12, qty: [1, 1], rarity: 'rare' },
      { item: 'Gold Coins', weight: 10, qty: [3, 9], rarity: 'rare' },
      { item: 'Spell Scroll (I)', weight: 16, qty: [1, 1], rarity: 'rare' },
      { item: 'Weapon Mod Kit', weight: 12, qty: [1, 1], rarity: 'rare' },
      { item: 'Rune Cluster', weight: 10, qty: [1, 1], rarity: 'rare' },
    ],
    epic: [
      { item: 'Elixir of Vigor', weight: 16, qty: [1, 1], rarity: 'epic' },
      { item: 'Relic Fragment', weight: 14, qty: [1, 1], rarity: 'epic' },
      { item: 'Spell Scroll (II)', weight: 14, qty: [1, 1], rarity: 'epic' },
      { item: 'Platinum Coins', weight: 10, qty: [2, 6], rarity: 'epic' },
      { item: 'Artifact Shard', weight: 10, qty: [1, 1], rarity: 'epic' },
    ],
    legendary: [
      { item: 'Ancient Relic', weight: 18, qty: [1, 1], rarity: 'legendary' },
      { item: 'Mythic Insignia', weight: 14, qty: [1, 1], rarity: 'legendary' },
      {
        item: 'Spell Scroll (III)',
        weight: 14,
        qty: [1, 1],
        rarity: 'legendary',
      },
      { item: 'Crown Gem', weight: 10, qty: [1, 2], rarity: 'legendary' },
    ],
  };

  // How many pulls per box rarity
  const PULLS = { common: 2, uncommon: 3, rare: 3, epic: 4, legendary: 5 };

  function weightedPick(list, rng) {
    const total = list.reduce((s, x) => s + x.weight, 0);
    let r = rng() * total;
    for (const entry of list) {
      if ((r -= entry.weight) <= 0) return entry;
    }
    return list[list.length - 1];
  }

  // Generate items for a box (deterministic from id/seed)
  function generate(rarity, seedOrUuid) {
    const table = TABLE[rarity];
    if (!table) return [];
    const seed =
      typeof seedOrUuid === 'number' ? seedOrUuid : seedFromUUID(seedOrUuid);
    const rng = makeRng(seed);
    const pulls = PULLS[rarity] || 2;

    const items = [];
    for (let i = 0; i < pulls; i++) {
      const roll = weightedPick(table, rng);
      const [a, b] = roll.qty || [1, 1];
      items.push({
        item_name: roll.item,
        qty: a === b ? a : randInt(rng, Math.min(a, b), Math.max(a, b)),
        rarity: roll.rarity || rarity,
      });
    }
    return items;
  }

  window.App.Logic.Loot = {
    generate,
    seedFromUUID,
  };
})();

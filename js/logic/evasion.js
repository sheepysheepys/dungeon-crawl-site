// /js/logic/evasion.js
(function (App) {
  // --- tuning knobs ---
  const EVASION_BASE = 10; // baseline for basic humans
  const ITEM_EVASION_CAP = 2; // cap item bonuses pre-classes
  const EVASION_MAX = 18; // hard ceiling (optional)

  function agilityMod(agi) {
    const a = Number(agi) || 0;
    return Math.floor((a - 10) / 2);
  }

  async function loadAgility(sb, chId) {
    const { data } = await sb
      .from('character_stats')
      .select('agility')
      .eq('character_id', chId)
      .maybeSingle();
    return Number(data?.agility ?? 10);
  }

  async function sumEquippedEvasionBonus(sb, chId) {
    const { data } = await sb
      .from('character_equipment')
      .select('item:items(evasion_bonus)')
      .eq('character_id', chId);
    const sum = (data || []).reduce(
      (n, r) => n + Number(r?.item?.evasion_bonus ?? 0),
      0
    );
    return Math.min(sum, ITEM_EVASION_CAP);
  }

  function computeEvasionLocal(agi, itemBonus) {
    const base = EVASION_BASE + agilityMod(agi);
    const total = Math.min(base + itemBonus, EVASION_MAX);
    return Math.max(0, total);
  }

  async function computeAndPersistEvasion(sb, chId) {
    const agi = await loadAgility(sb, chId);
    const itemBonus = await sumEquippedEvasionBonus(sb, chId);
    const evasion = computeEvasionLocal(agi, itemBonus);

    const { data, error } = await sb
      .from('characters')
      .update({ evasion })
      .eq('id', chId)
      .select('evasion')
      .single();

    if (!error) {
      if (window.AppState?.character)
        window.AppState.character.evasion = data.evasion;
      setText?.('evasion', data.evasion);
    }
    return { evasion, agi, itemBonus };
  }

  App.Logic = App.Logic || {};
  App.Logic.evasion = { computeAndPersistEvasion, agilityMod };
})(window.App || (window.App = {}));

// /js/logic/evasion.js (or wherever)
(function (App) {
  async function computeAndPersistEvasion(sb, characterId) {
    // 1) Stats (tolerant)
    const { data: stats, error: sErr } = await sb
      .from('character_stats')
      .select('*')
      .eq('character_id', characterId)
      .maybeSingle();
    if (sErr) {
      console.warn('[evasion] stats error', sErr);
    }

    const agility = Number(stats?.agility ?? 0); // falls back to 0 if not present
    const agiMod = Math.floor((agility - 10) / 2);

    // 2) Equipment evasion bonuses (tolerant join)
    const { data: equip, error: eErr } = await sb
      .from('character_equipment')
      .select('slot, item:items(evasion_bonus)') // requires FK; otherwise split into two queries
      .eq('character_id', characterId);
    if (eErr) {
      console.warn('[evasion] equip error', eErr);
    }

    const itemBonus = (equip || []).reduce((sum, row) => {
      const b = Number(row?.item?.evasion_bonus ?? 0);
      return sum + (Number.isFinite(b) ? b : 0);
    }, 0);

    const base = 10; // your chosen human baseline
    const evasion = Math.max(0, base + agiMod + itemBonus);

    // 3) Persist
    const { error: uErr } = await sb
      .from('characters')
      .update({ evasion })
      .eq('id', characterId);
    if (uErr) console.warn('[evasion] persist failed', uErr);

    return evasion;
  }

  App.Logic = App.Logic || {};
  App.Logic.evasion = App.Logic.evasion || {};
  App.Logic.evasion.computeAndPersistEvasion = computeAndPersistEvasion;
})(window.App || (window.App = {}));

// /js/logic/weapons.js — weapon damage + ability score modifiers
(function (App) {
  App.Logic = App.Logic || {};

  const STAT_KEYS = [
    'strength',
    'agility',
    'finesse',
    'instinct',
    'presence',
    'knowledge',
  ];

  const STAT_ABBR = {
    strength: 'STR',
    agility: 'AGI',
    finesse: 'FIN',
    instinct: 'INS',
    presence: 'PRE',
    knowledge: 'KNO',
  };

  function normStatKey(raw) {
    const k = String(raw || 'strength').trim().toLowerCase();
    return STAT_KEYS.includes(k) ? k : 'strength';
  }

  function readStatTotal(statsRow, statKey) {
    const k = normStatKey(statKey);
    const row = statsRow || {};
    let base = 10;

    if (`trait_${k}_base` in row) base = Number(row[`trait_${k}_base`] ?? 10);
    else if (`stat_${k}` in row) base = Number(row[`stat_${k}`] ?? 10);
    else if (k in row) base = Number(row[k] ?? 10);

    let extra = 0;
    if (`trait_${k}_bonus` in row) extra = Number(row[`trait_${k}_bonus`] ?? 0);
    else if (`stat_${k}_bonus` in row) extra = Number(row[`stat_${k}_bonus`] ?? 0);

    return Math.min(20, (Number(base) || 0) + (Number(extra) || 0));
  }

  function abilityMod(score) {
    const n = Number(score);
    if (!Number.isFinite(n)) return 0;
    return Math.floor((n - 10) / 2);
  }

  function parseDamageExpr(raw) {
    const s = String(raw || '').trim();
    if (!s) return { dice: null, flat: 0, raw: '' };

    const diceMatch = s.match(/^(\d+d\d+)([+-]\d+)?$/i);
    if (diceMatch) {
      return {
        dice: diceMatch[1].toLowerCase(),
        flat: diceMatch[2] ? parseInt(diceMatch[2], 10) : 0,
        raw: s,
      };
    }

    const num = Number(s);
    if (Number.isFinite(num)) return { dice: null, flat: num, raw: s };

    return { dice: null, flat: 0, raw: s };
  }

  function formatSigned(n) {
    const v = Number(n) || 0;
    if (v === 0) return '';
    return v > 0 ? `+${v}` : String(v);
  }

  function formatWeaponDamage(baseDamage, statMod) {
    const parsed = parseDamageExpr(baseDamage);
    const mod = Number(statMod) || 0;

    if (parsed.raw && !parsed.dice && parsed.flat === 0 && mod === 0) {
      return { display: parsed.raw, breakdown: null };
    }

    const totalFlat = parsed.flat + mod;

    if (parsed.dice) {
      const flatPart = formatSigned(totalFlat);
      return {
        display: flatPart ? `${parsed.dice}${flatPart}` : parsed.dice,
        breakdown: mod !== 0 ? mod : null,
      };
    }

    if (parsed.flat !== 0 || mod !== 0) {
      return {
        display: String(totalFlat),
        breakdown: mod !== 0 ? mod : null,
      };
    }

    return { display: '—', breakdown: null };
  }

  function inferDamageStat(item) {
    if (item?.damage_stat) return normStatKey(item.damage_stat);

    const name = String(item?.name || '').toLowerCase();
    const notes = String(item?.notes || '').toLowerCase();
    const blob = `${name} ${notes}`;

    if (/\bfinesse\b/.test(blob)) return 'finesse';

    if (
      /\b(rapier|dagger|shortsword|short sword|stiletto|whip|scimitar)\b/.test(
        blob
      )
    ) {
      return 'finesse';
    }

    if (/\bknife\b/.test(blob) || /\bknives\b/.test(blob)) return 'finesse';

    if (/\b(umbrella blade|spatula blade)\b/.test(blob)) return 'finesse';

    if (
      (/\b(crossbow|sling|recurve|shortbow|longbow)\b/.test(blob) ||
      /\bbow\b/.test(blob)
    ) {
      if (!/\belbow\b/.test(blob)) return 'agility';
    }

    return 'strength';
  }

  function computeWeaponLine(item, statsRow) {
    const statKey = inferDamageStat(item);
    const total = readStatTotal(statsRow, statKey);
    const mod = abilityMod(total);
    const { display, breakdown } = formatWeaponDamage(item?.damage, mod);

    return {
      display,
      statKey,
      statAbbr: STAT_ABBR[statKey] || statKey.toUpperCase(),
      statTotal: total,
      mod,
      breakdown,
      baseDamage: item?.damage || '',
    };
  }

  App.Logic.weapons = {
    STAT_KEYS,
    STAT_ABBR,
    normStatKey,
    readStatTotal,
    abilityMod,
    parseDamageExpr,
    formatWeaponDamage,
    inferDamageStat,
    computeWeaponLine,
  };
})(window.App || (window.App = {}));

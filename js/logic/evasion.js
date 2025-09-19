// /js/logic/evasion.js
(function (App) {
  App.Logic = App.Logic || {};
  App.Logic.evasion = App.Logic.evasion || {};

  // ===========================
  // Tunables
  // ===========================
  const EVASION_BASE = 10; // baseline for basic humans
  const EVASION_MAX = 18; // optional ceiling (tweak or remove)
  const USE_ITEM_BONUS = false; // flip to true after you add items.evasion_bonus column

  // ===========================
  // Helpers
  // ===========================
  function agilityMod(agi) {
    const a = Number(agi);
    if (!Number.isFinite(a)) return 0;
    return Math.floor((a - 10) / 2);
  }

  async function fetchStats(sb, characterId) {
    const { data, error } = await sb
      .from('character_stats')
      .select('*')
      .eq('character_id', characterId)
      .maybeSingle();
    if (error) {
      console.warn('[evasion] stats read error', error);
      return null;
    }
    return data || null;
  }

  // Item bonus is disabled by default to avoid your schema error.
  // When you add:  alter table public.items add column evasion_bonus int not null default 0;
  // set USE_ITEM_BONUS = true and replace this with a safe join or a two-step fetch.
  async function sumEquippedEvasionBonus(sb, characterId) {
    if (!USE_ITEM_BONUS) return 0;

    try {
      const { data, error } = await sb
        .from('character_equipment')
        .select('slot, item:items(evasion_bonus)')
        .eq('character_id', characterId);

      if (error) {
        console.warn('[evasion] equip read error', error);
        return 0;
      }

      const sum = (data || []).reduce((n, r) => {
        const b = Number(r?.item?.evasion_bonus ?? 0);
        return n + (Number.isFinite(b) ? b : 0);
      }, 0);

      return sum;
    } catch (e) {
      console.warn('[evasion] equip bonus error (fallback to 0)', e);
      return 0;
    }
  }

  function computeEvasionLocal(agi, itemBonus) {
    const basePlusAgi = EVASION_BASE + agilityMod(agi);
    // never below base; clamp to max if you want a ceiling
    const raw = Math.max(EVASION_BASE, basePlusAgi + (Number(itemBonus) || 0));
    return Number.isFinite(EVASION_MAX) ? Math.min(raw, EVASION_MAX) : raw;
  }

  // ===========================
  // Public: recompute + persist evasion
  // ===========================
  async function computeAndPersistEvasion(sb, characterId) {
    if (!sb || !characterId) return null;

    // 1) Stats
    const stats = await fetchStats(sb, characterId);
    const agility = Number(stats?.agility ?? 10); // sane default 10 if missing

    // 2) Item bonus (off by default to avoid schema error)
    const itemBonus = await sumEquippedEvasionBonus(sb, characterId);

    // 3) Compute & floor at base
    const evasion = computeEvasionLocal(agility, itemBonus);

    // 4) Persist to characters
    const { data, error } = await sb
      .from('characters')
      .update({ evasion })
      .eq('id', characterId)
      .select('evasion')
      .single();

    if (error) {
      console.warn('[evasion] persist failed', error);
      return { evasion, agility, itemBonus, persisted: false };
    }

    // 5) Update local state + UI immediately (no refresh)
    if (window.AppState?.character) {
      window.AppState.character.evasion = data.evasion;
    }
    const evEl = document.getElementById('evasion');
    if (evEl) evEl.textContent = String(data.evasion);

    return { evasion: data.evasion, agility, itemBonus, persisted: true };
  }

  // ===========================
  // Public: refresh stats UI + recompute evasion
  // Call this right after level-up confirm (since stat bumps can happen there)
  // ===========================
  async function refreshStatsAndEvasion(sb, characterId) {
    if (!sb || !characterId) return null;

    // Re-fetch stats row
    const stats = await fetchStats(sb, characterId);

    // Paint stats immediately if your renderer exists
    if (typeof window.renderAllTraits === 'function') {
      window.renderAllTraits(stats || {});
    }

    // If you cache stats anywhere else on AppState, update it
    if (!window.AppState) window.AppState = {};
    window.AppState.stats = stats || window.AppState.stats;

    // Recompute evasion with fresh stats
    const ev = await computeAndPersistEvasion(sb, characterId);

    return { stats, evasionResult: ev };
  }

  // Expose API
  App.Logic.evasion.agilityMod = agilityMod;
  App.Logic.evasion.computeAndPersistEvasion = computeAndPersistEvasion;
  App.Logic.evasion.refreshStatsAndEvasion = refreshStatsAndEvasion;
})(window.App || (window.App = {}));

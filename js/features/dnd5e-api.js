// features/dnd5e-api.js — read-only client for https://www.dnd5eapi.co (SRD content)
(function (global) {
  const App = (global.App = global.App || { Features: {} });

  const API_BASE = 'https://www.dnd5eapi.co';
  const cache = new Map();

  function toSlug(name) {
    if (!name) return null;
    const trimmed = String(name).trim();
    if (!trimmed || trimmed.toLowerCase() === 'n/a') return null;
    return trimmed.toLowerCase().replace(/\s+/g, '-');
  }

  function joinDesc(desc) {
    if (!desc) return '';
    return Array.isArray(desc) ? desc.filter(Boolean).join('\n\n') : String(desc);
  }

  async function apiGet(path) {
    const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
    if (cache.has(url)) return cache.get(url);

    const res = await fetch(url);
    if (!res.ok) {
      const err = new Error(`dnd5e API ${res.status}`);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    cache.set(url, data);
    return data;
  }

  async function fetchResource(url) {
    try {
      const data = await apiGet(url);
      return {
        name: data.name || '—',
        description: joinDesc(data.desc),
        index: data.index || url,
      };
    } catch (e) {
      if (e.status === 404) return null;
      console.warn('[dnd5e] resource fetch failed', url, e);
      return null;
    }
  }

  async function fetchRaceAbilities(raceName) {
    const slug = toSlug(raceName);
    if (!slug) return [];

    try {
      const race = await apiGet(`/api/2014/races/${slug}`);
      const traits = race.traits || [];
      const results = await Promise.all(
        traits.map((t) => fetchResource(t.url))
      );
      return results
        .filter(Boolean)
        .map((t) => ({
          name: t.name,
          description: t.description,
          source: 'race',
          sourceLabel: race.name || raceName,
        }));
    } catch (e) {
      if (e.status !== 404) console.warn('[dnd5e] race fetch failed', slug, e);
      return [];
    }
  }

  async function fetchClassAbilities(className, characterLevel) {
    const slug = toSlug(className);
    if (!slug) return [];

    const maxLevel = Math.min(Math.max(1, Number(characterLevel) || 1), 20);

    try {
      await apiGet(`/api/2014/classes/${slug}`);
    } catch (e) {
      if (e.status !== 404) console.warn('[dnd5e] class fetch failed', slug, e);
      return [];
    }

    const levelRows = await Promise.all(
      Array.from({ length: maxLevel }, (_, i) =>
        apiGet(`/api/2014/classes/${slug}/levels/${i + 1}`).catch(() => null)
      )
    );

    const seen = new Set();
    const abilities = [];

    for (const row of levelRows) {
      if (!row?.features?.length) continue;
      const featureResults = await Promise.all(
        row.features.map((f) => fetchResource(f.url))
      );
      for (const feat of featureResults) {
        if (!feat || seen.has(feat.index)) continue;
        seen.add(feat.index);
        abilities.push({
          name: feat.name,
          description: feat.description,
          source: 'class',
          sourceLabel: className,
          level: row.level,
        });
      }
    }

    return abilities;
  }

  /** Map SRD ability score index → site stat key. */
  const ABILITY_TO_STAT = {
    str: 'strength',
    dex: 'agility',
    int: 'knowledge',
    wis: 'instinct',
    cha: 'presence',
  };

  async function fetchClassMeta(className) {
    const slug = toSlug(className);
    if (!slug) return null;

    try {
      const cls = await apiGet(`/api/2014/classes/${slug}`);
      const savingThrowStats = (cls.saving_throws || [])
        .map((st) => ABILITY_TO_STAT[st.index])
        .filter(Boolean);

      let spellcasting = null;
      if (cls.spellcasting?.spellcasting_ability?.index) {
        const stat = ABILITY_TO_STAT[cls.spellcasting.spellcasting_ability.index];
        if (stat) {
          spellcasting = {
            stat,
            level: Number(cls.spellcasting.level) || 1,
            label: cls.spellcasting.spellcasting_ability.name || stat,
          };
        }
      }

      return { savingThrowStats, spellcasting, className: cls.name || className };
    } catch (e) {
      if (e.status !== 404) console.warn('[dnd5e] class meta fetch failed', slug, e);
      return null;
    }
  }

  App.Features.dnd5e = {
    toSlug,
    ABILITY_TO_STAT,
    fetchRaceAbilities,
    fetchClassAbilities,
    fetchClassMeta,
  };
})(window);

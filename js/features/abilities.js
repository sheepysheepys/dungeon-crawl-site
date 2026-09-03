// features/abilities.js
(function (global) {
  const App = (global.App = global.App || { Features: {}, Logic: {} });

  async function loadEquipmentAbilities(characterId) {
    const client = global.sb;
    if (!client) return [];
    const { data: rows, error } = await client
      .from('character_abilities')
      .select('slot, ability_id')
      .eq('character_id', characterId);

    if (error) {
      console.warn('[abilities] equipment rows error', error);
      return [];
    }
    if (!rows?.length) return [];

    const ids = [...new Set(rows.map((r) => r.ability_id).filter(Boolean))];
    if (!ids.length) return [];

    const { data: abilities, error: aErr } = await client
      .from('abilities')
      .select('id, name, description')
      .in('id', ids);

    if (aErr) {
      console.warn('[abilities] equipment abilities error', aErr);
      return [];
    }

    const byId = Object.fromEntries((abilities || []).map((a) => [a.id, a]));
    return rows
      .map((r) => ({
        slot: r.slot,
        name: byId[r.ability_id]?.name || '—',
        description: byId[r.ability_id]?.description || '',
        source: 'equipment',
      }))
      .filter((r) => r.name !== '—');
  }

  async function loadCustomSourceAbilities(race, cls, characterLevel, classLevel) {
    const client = global.sb;
    if (!client) return [];

    const charLvl = Math.max(1, Number(characterLevel) || 1);
    const classLvl = Math.max(1, Number(classLevel) || 1);
    const cols = 'source_type, source_name, name, description, level_required';

    const queries = [];
    const raceName = (race || '').trim();
    const className = (cls || '').trim();

    if (raceName) {
      queries.push(
        client
          .from('source_abilities')
          .select(cols)
          .eq('source_type', 'race')
          .ilike('source_name', raceName)
      );
    }
    if (className) {
      queries.push(
        client
          .from('source_abilities')
          .select(cols)
          .eq('source_type', 'class')
          .ilike('source_name', className)
      );
    }

    if (!queries.length) return [];

    const results = await Promise.all(queries);
    const data = results.flatMap((r) => {
      if (r.error) {
        if (r.error.code !== 'PGRST205' && r.error.code !== '42P01') {
          console.warn('[abilities] custom source error', r.error);
        }
        return [];
      }
      return r.data || [];
    });

    const raceKey = raceName.toLowerCase();
    const classKey = className.toLowerCase();

    return data
      .filter((row) => {
        const src = (row.source_name || '').trim().toLowerCase();
        const req = Math.max(1, Number(row.level_required) || 1);
        if (row.source_type === 'race') {
          return raceKey && src === raceKey && req <= charLvl;
        }
        if (row.source_type === 'class') {
          return classKey && src === classKey && req <= classLvl;
        }
        return false;
      })
      .map((row) => ({
        name: row.name,
        description: row.description || '',
        source: row.source_type,
        sourceLabel: row.source_name,
        level: row.level_required > 1 ? row.level_required : null,
      }));
  }

  function dedupeAbilities(items) {
    const seen = new Set();
    return items.filter((item) => {
      const key = `${item.source || ''}|${item.name}|${item.level ?? 0}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function splitDescription(text) {
    return String(text || '')
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter(Boolean);
  }

  function isLongDescription(text) {
    const t = String(text || '').trim();
    return t.length > 120 || splitDescription(t).length > 1;
  }

  function renderAbilityCard(item, opts = {}) {
    const desc = item.description || '';
    const paras = splitDescription(desc);
    const long = isLongDescription(desc);

    const card = el('details', {
      class: `ability-card${long ? '' : ' ability-card--static'}`,
    });
    if (!long) card.open = true;

    const summary = el('summary', { class: 'ability-card-summary' });
    const head = el('div', { class: 'ability-card-head' });
    head.append(el('span', { class: 'ability-card-name' }, item.name));

    if (item.level) {
      head.append(el('span', { class: 'ability-level-badge' }, `Lv ${item.level}`));
    }
    if (opts.showSlot && item.slot) {
      head.append(
        el('span', { class: 'ability-slot-badge' }, item.slot.toUpperCase())
      );
    }
    summary.append(head);
    card.append(summary);

    if (paras.length) {
      const body = el('div', { class: 'ability-card-body' });
      paras.forEach((p) => body.append(el('p', { class: 'ability-card-desc' }, p)));
      card.append(body);
    }

    return card;
  }

  function renderSection(title, items, opts = {}) {
    if (!items.length) return null;

    const section = el('details', { class: 'ability-section' });
    section.open = true;
    const summary = el('summary', { class: 'ability-section-summary' });
    summary.append(el('span', { class: 'ability-section-title' }, title));
    summary.append(
      el('span', { class: 'ability-section-count' }, String(items.length))
    );
    section.append(summary);

    const list = el('div', { class: 'ability-cards' });
    items.forEach((item) => list.append(renderAbilityCard(item, opts)));
    section.append(list);
    return section;
  }

  async function render(characterId, { force = false } = {}) {
    const root = document.getElementById('abilitiesList');
    const empty = document.getElementById('abilitiesEmpty');
    if (!root) return;

    if (
      !force &&
      window.AppState?._abilitiesRenderedFor === characterId &&
      root.childElementCount > 0
    ) {
      return;
    }

    const char =
      global.AppState?.character ||
      (await (async () => {
        const client = global.sb;
        if (!client) return null;
        const { data } = await client
          .from('characters')
          .select('race, class, level, class_level')
          .eq('id', characterId)
          .maybeSingle();
        return data;
      })());

    root.innerHTML = '';
    if (empty) {
      empty.textContent = 'Loading abilities…';
      empty.style.display = '';
    }

    const race = char?.race;
    const cls = char?.class;
    const characterLevel = char?.level ?? 1;
    const classLevel = char?.class_level ?? 1;
    const dnd5e = App.Features.dnd5e;

    const [apiRace, apiClass, custom, equipment] = await Promise.all([
      dnd5e?.fetchRaceAbilities?.(race) ?? [],
      dnd5e?.fetchClassAbilities?.(cls, classLevel) ?? [],
      loadCustomSourceAbilities(race, cls, characterLevel, classLevel),
      loadEquipmentAbilities(characterId),
    ]);

    const raceItems = dedupeAbilities([
      ...apiRace,
      ...custom.filter((a) => a.source === 'race'),
    ]);
    const classItems = dedupeAbilities(
      [...apiClass, ...custom.filter((a) => a.source === 'class')].sort(
        (a, b) =>
          (a.level ?? 0) - (b.level ?? 0) ||
          String(a.name).localeCompare(String(b.name))
      )
    );

    const sections = [
      raceItems.length
        ? renderSection(`Race — ${race}`, raceItems)
        : race && race.trim().toLowerCase() !== 'n/a'
          ? el(
              'div',
              { class: 'ability-section ability-section--empty' },
              el('h3', { class: 'ability-section-title' }, `Race — ${race}`),
              el(
                'p',
                { class: 'muted' },
                'No SRD traits found. Add custom race abilities in source_abilities.'
              )
            )
          : null,
      classItems.length
        ? renderSection(`Class — ${cls} (Class Level ${classLevel})`, classItems)
        : cls
          ? el(
              'div',
              { class: 'ability-section ability-section--empty' },
              el(
                'h3',
                { class: 'ability-section-title' },
                `Class — ${cls} (Class Level ${classLevel})`
              ),
              el(
                'p',
                { class: 'muted' },
                'No SRD class features found. Add custom class abilities in source_abilities.'
              )
            )
          : null,
      equipment.length
        ? renderSection('Equipment', equipment, { showSlot: true })
        : null,
    ].filter(Boolean);

    root.innerHTML = '';
    if (!sections.length) {
      if (empty) {
        empty.textContent = 'No abilities yet.';
        empty.style.display = '';
      }
      return;
    }

    if (empty) empty.style.display = 'none';
    sections.forEach((node) => root.append(node));
    window.AppState = window.AppState || {};
    window.AppState._abilitiesRenderedFor = characterId;
  }

  App.Features.abilities = { render };
})(window);

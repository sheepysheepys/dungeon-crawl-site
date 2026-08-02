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

    const { data, error } = await client
      .from('source_abilities')
      .select('source_type, source_name, name, description, level_required');

    if (error) {
      // Table may not exist until migration is run — fail quietly.
      if (error.code !== 'PGRST205' && error.code !== '42P01') {
        console.warn('[abilities] custom source error', error);
      }
      return [];
    }

    const raceKey = (race || '').trim().toLowerCase();
    const classKey = (cls || '').trim().toLowerCase();

    return (data || [])
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

  function renderSection(title, items, opts = {}) {
    if (!items.length) return null;
    const section = el('div', { class: 'ability-section' });
    section.append(el('h3', { class: 'ability-section-title' }, title));

    const list = el('div', { class: 'ability-cards' });
    items.forEach((item) => {
      const card = el('div', { class: 'ability-card' });
      const head = el('div', { class: 'ability-card-head' });
      head.append(el('strong', { class: 'ability-card-name' }, item.name));

      if (item.level) {
        head.append(el('span', { class: 'ability-level-badge' }, `Lv ${item.level}`));
      }
      if (opts.showSlot && item.slot) {
        head.append(
          el('span', { class: 'ability-slot-badge' }, item.slot.toUpperCase())
        );
      }

      card.append(head);
      if (item.description) {
        card.append(el('div', { class: 'ability-card-desc mono muted' }, item.description));
      }
      list.append(card);
    });
    section.append(list);
    return section;
  }

  async function render(characterId) {
    const root = document.getElementById('abilitiesList');
    const empty = document.getElementById('abilitiesEmpty');
    if (!root) return;

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

    const raceItems = [...apiRace, ...custom.filter((a) => a.source === 'race')];
    const classItems = [...apiClass, ...custom.filter((a) => a.source === 'class')];

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
  }

  App.Features.abilities = { render };
})(window);

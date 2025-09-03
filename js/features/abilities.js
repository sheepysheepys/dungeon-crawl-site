// features/abilities.js
(function (global) {
  const App = (global.App = global.App || { Features: {}, Logic: {} });

  // Robust: no FK join dependency — fetch rows, then abilities
  async function loadActiveAbilities(characterId) {
    const client = global.sb;
    if (!client) return [];
    const { data: rows, error } = await client
      .from('character_abilities')
      .select('slot, ability_id')
      .eq('character_id', characterId);

    if (error) {
      console.warn('[abilities] rows error', error);
      return [];
    }
    if (!rows || !rows.length) return [];

    const ids = [...new Set(rows.map((r) => r.ability_id).filter(Boolean))];
    if (!ids.length) return [];

    const { data: abilities, error: aErr } = await client
      .from('abilities')
      .select('id, name, description')
      .in('id', ids);

    if (aErr) {
      console.warn('[abilities] abilities error', aErr);
      return [];
    }

    const byId = Object.fromEntries((abilities || []).map((a) => [a.id, a]));
    return rows.map((r) => ({
      slot: r.slot,
      ability: byId[r.ability_id] || null,
    }));
  }

  async function render(characterId) {
    const list = await loadActiveAbilities(characterId);
    const root = document.getElementById('abilitiesList');
    const empty = document.getElementById('abilitiesEmpty');
    if (!root) return;

    root.innerHTML = '';
    if (!list.length) {
      if (empty) empty.style.display = '';
      return;
    }
    if (empty) empty.style.display = 'none';

    list.forEach((row) => {
      const slot = (row.slot || '—').toUpperCase();
      const name = row.ability?.name || '—';
      const desc = row.ability?.description || '';
      const wrap = document.createElement('div');
      wrap.className = 'list';
      wrap.append(
        el(
          'div',
          { class: 'row' },
          el('div', {}, el('strong', {}, slot), ' · ', name)
        ),
        el('div', { class: 'mono muted' }, desc)
      );
      root.append(wrap);
    });
  }

  App.Features.abilities = { render };
})(window);

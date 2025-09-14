// /js/dm.js
(function () {
  // Get the actual Supabase client instance (not the SDK namespace)
  const supa = window.supabaseClient || window.sb || window.supabase?.client;
  if (!supa || typeof supa.from !== 'function') {
    console.error(
      '[dm] Supabase client missing. Check script order and supabase-client.js exports.'
    );
    return;
  }

  const $ = (s) => document.querySelector(s);
  const msgEl = $('#dmMsg');
  const setMsg = (t) => {
    if (msgEl) msgEl.textContent = t || '';
  };

  // === set this to match your loot_boxes column name ===
  // If your table uses 'rarity', leave as 'rarity'.
  // If your table uses 'box_type', change this to 'box_type'.
  const LOOT_RARITY_FIELD = 'rarity';

  // Load characters into the dropdown
  async function loadChars() {
    try {
      const { data, error } = await supa
        .from('characters')
        .select('id,name')
        .order('name');

      if (error) throw error;

      const sel = $('#dmChar');
      if (!sel) return;

      sel.innerHTML = '';
      (data || []).forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name || c.id;
        sel.appendChild(opt);
      });

      setMsg(
        data && data.length ? '' : 'No characters found (check RLS/policies).'
      );
    } catch (e) {
      console.error('[dm] loadChars', e);
      setMsg('Error loading characters: ' + (e?.message || e));
    }
  }

  // Insert into achievements (id, title, description, awarded_at, character_id)
  async function grantAchievement() {
    try {
      const character_id = $('#dmChar')?.value;
      const title = $('#dmTitle')?.value?.trim() || '';
      const description = $('#dmDesc')?.value?.trim() || '';

      if (!character_id || !title) {
        setMsg('Pick a character and enter a title.');
        return;
      }

      const payload = {
        character_id,
        title,
        description: description || null,
        awarded_at: new Date().toISOString(), // remove if DB has DEFAULT now()
      };

      const { error } = await supa.from('achievements').insert(payload);
      if (error) throw error;

      setMsg('Achievement granted.');
      const t = $('#dmTitle');
      if (t) t.value = '';
      const d = $('#dmDesc');
      if (d) d.value = '';
    } catch (e) {
      console.error('[dm] grantAchievement', e);
      setMsg('Error: ' + (e?.message || e));
    }
  }

  // Insert a loot box for the selected character
  async function grantBox() {
    try {
      const character_id = $('#dmChar')?.value;
      const rarity = $('#dmRarity')?.value;

      if (!character_id) {
        setMsg('Pick a character first.');
        return;
      }

      const payload = { character_id, status: 'pending' };
      payload[LOOT_RARITY_FIELD] = rarity; // 'rarity' or 'box_type'

      const { error } = await supa.from('loot_boxes').insert(payload);
      if (error) throw error;

      setMsg(`Loot box (${rarity}) granted.`);
    } catch (e) {
      console.error('[dm] grantBox', e);
      setMsg('Error: ' + (e?.message || e));
    }
  }

  window.addEventListener('load', () => {
    document
      .getElementById('btnGrantAch')
      ?.addEventListener('click', grantAchievement);
    document.getElementById('btnGrantBox')?.addEventListener('click', grantBox);
    loadChars();
  });
})();

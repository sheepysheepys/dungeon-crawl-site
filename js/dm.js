(async function () {
  // Get the actual Supabase client instance (not the SDK namespace)
  const supa = window.supabaseClient || window.sb || window.supabase?.client;
  if (!supa || typeof supa.from !== 'function') {
    console.error(
      '[dm] Supabase client missing. Check script order and supabase-client.js exports.'
    );
    return;
  }

  const $ = (s) => document.querySelector(s);
  const msg = $('#dmMsg');
  const setMsg = (t) => {
    if (msg) msg.textContent = t || '';
  };

  // Load characters into the dropdown
  async function loadChars() {
    try {
      const { data, error } = await supa
        .from('characters')
        .select('id,name')
        .order('name');

      if (error) throw error;

      const sel = $('#dmChar');
      sel.innerHTML = '';
      (data || []).forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name || c.id;
        sel.appendChild(opt);
      });

      if (!data || data.length === 0) {
        setMsg('No characters found (check RLS/policies).');
      } else {
        setMsg('');
      }
    } catch (e) {
      console.error('[dm] loadChars', e);
      setMsg('Error loading characters: ' + (e?.message || e));
    }
  }

  (async function () {
    // Use the actual client instance (not the SDK namespace)
    const supa = window.supabaseClient || window.sb || window.supabase?.client;
    if (!supa || typeof supa.from !== 'function') {
      console.error(
        '[dm] Supabase client missing. Check script order and supabase-client.js exports.'
      );
      return;
    }

    const $ = (s) => document.querySelector(s);
    const msg = $('#dmMsg');
    const setMsg = (t) => {
      if (msg) msg.textContent = t || '';
    };

    // === set this to match your loot_boxes column name ===
    // If your table uses 'rarity', leave as 'rarity'.
    // If your table uses 'box_type', change this to 'box_type'.
    const LOOT_RARITY_FIELD = 'rarity';

    async function loadChars() {
      try {
        const { data, error } = await supa
          .from('characters')
          .select('id,name')
          .order('name');
        if (error) throw error;

        const sel = $('#dmChar');
        sel.innerHTML = '';
        (data || []).forEach((c) => {
          const opt = document.createElement('option');
          opt.value = c.id;
          opt.textContent = c.name || c.id;
          sel.appendChild(opt);
        });
        setMsg(data?.length ? '' : 'No characters found.');
      } catch (e) {
        console.error('[dm] loadChars', e);
        setMsg('Error loading characters: ' + (e?.message || e));
      }
    }

    // --- use your achievements table with (id, title, description, awarded_at, character_id)
    async function grantAchievement() {
      try {
        const character_id = $('#dmChar').value;
        const title = $('#dmTitle').value.trim();
        const description = $('#dmDesc').value.trim();
        if (!character_id || !title) {
          setMsg('Pick a character and enter a title.');
          return;
        }

        const payload = {
          character_id,
          title,
          description: description || null,
          awarded_at: new Date().toISOString(), // remove if your column has a DEFAULT now()
        };

        const { error } = await supa.from('achievements').insert(payload);
        if (error) throw error;

        setMsg('Achievement granted.');
        $('#dmTitle').value = '';
        $('#dmDesc').value = '';
      } catch (e) {
        console.error('[dm] grantAchievement', e);
        setMsg('Error: ' + (e?.message || e));
      }
    }

    async function grantBox() {
      try {
        const character_id = $('#dmChar').value;
        const rarity = $('#dmRarity').value;
        if (!character_id) {
          setMsg('Pick a character first.');
          return;
        }

        const payload = { character_id, status: 'pending' };
        payload[LOOT_RARITY_FIELD] = rarity; // 'rarity' or 'box_type' depending on your schema

        const { error } = await supa.from('loot_boxes').insert(payload);
        if (error) throw error;

        setMsg(`Loot box (${rarity}) granted.`);
      } catch (e) {
        console.error('[dm] grantBox', e);
        setMsg('Error: ' + (e?.message || e));
      }
    }

    document.addEventListener('DOMContentLoaded', loadChars);
    $('#btnGrantAch').addEventListener('click', grantAchievement);
    $('#btnGrantBox').addEventListener('click', grantBox);
  })();

  document.addEventListener('DOMContentLoaded', loadChars);
  $('#btnGrantAch').addEventListener('click', grantAchievement);
  $('#btnGrantBox').addEventListener('click', grantBox);
})();

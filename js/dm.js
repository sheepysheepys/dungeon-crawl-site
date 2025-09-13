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

  async function grantAchievement() {
    try {
      const character_id = $('#dmChar').value;
      const description = $('#dmDesc').value.trim();
      if (!character_id || !description) {
        setMsg('Pick a character and enter a description.');
        return;
      }
      const { error } = await supa
        .from('achievements') // if your table is 'awards', change this
        .insert({ character_id, description });

      if (error) throw error;

      setMsg('Achievement granted.');
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
      const { error } = await supa
        .from('loot_boxes')
        .insert({ character_id, rarity, status: 'pending' }); // include status if your schema expects it

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

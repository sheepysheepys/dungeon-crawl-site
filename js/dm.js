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

  // ----------------------------
  // Load characters into the dropdown
  // ----------------------------
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

  // ----------------------------
  // Grant an achievement
  // ----------------------------
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

  // ----------------------------
  // Grant a loot box (insert + pre-seed via RPC)
  //   Uses server-side function:
  //   rpc_give_and_seed_loot_box(p_character_id uuid, p_box_rarity loot_rarity) -> uuid
  // ----------------------------
  async function grantBox() {
    try {
      const character_id = $('#dmChar')?.value;
      const rarity = $('#dmRarity')?.value; // 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

      if (!character_id) {
        setMsg('Pick a character first.');
        return;
      }
      if (!rarity) {
        setMsg('Pick a box rarity.');
        return;
      }

      // Button UX
      const btn = $('#btnGrantBox');
      const prev = btn?.textContent;
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Granting...';
      }

      // Call RPC that creates the row and pre-rolls/freeze contents
      const { data: newBoxId, error } = await supa.rpc(
        'rpc_give_and_seed_loot_box',
        {
          p_character_id: character_id,
          p_box_rarity: rarity,
        }
      );
      if (error) throw error;

      setMsg(`Loot box (${rarity}) granted.`);
      // If your player "awards" panel doesn't auto-refresh from realtime,
      // you can force refresh here:
      // window.App?.Features?.awards?.render?.(character_id);

      if (btn) {
        btn.disabled = false;
        btn.textContent = prev || 'Grant Loot Box';
      }
    } catch (e) {
      console.error('[dm] grantBox', e);
      setMsg('Error: ' + (e?.message || e));
      const btn = $('#btnGrantBox');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Grant Loot Box';
      }
    }
  }

  // ----------------------------
  // Wire up UI
  // ----------------------------
  window.addEventListener('load', () => {
    $('#btnGrantAch')?.addEventListener('click', grantAchievement);
    $('#btnGrantBox')?.addEventListener('click', grantBox);
    loadChars();
  });
})();

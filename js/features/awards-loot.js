// /js/features/awards-loot.js
(() => {
  // Use the actual Supabase client instance (not the SDK namespace)
  const sb = window.sb || window.supabaseClient;
  if (!sb) {
    console.error(
      '[awards-loot] Supabase client missing. Make sure supabase-client.js runs before this file.'
    );
  }

  const $ = (id) => document.getElementById(id);

  // ---------- utils ----------
  function escapeHtml(s) {
    return String(s ?? '').replace(
      /[&<>"']/g,
      (m) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        }[m])
    );
  }
  function cap(s) {
    s = String(s ?? '');
    return s ? s[0].toUpperCase() + s.slice(1) : '';
  }

  // ---------- data ----------
  async function fetchAwardsAndLoot(characterId) {
    if (!sb) return { achievements: [], loot: [] };

    // Achievements (your table)
    const { data: achievements, error: aErr } = await sb
      .from('achievements')
      .select('id, title, description, awarded_at')
      .eq('character_id', characterId)
      .order('awarded_at', { ascending: false });

    if (aErr) console.error('[awards] fetch', aErr);

    // Loot boxes (rarity now exists in this table per your note)
    const { data: lootRaw, error: lErr } = await sb
      .from('loot_boxes')
      .select('id, rarity, status, created_at')
      .eq('character_id', characterId)
      .order('created_at', { ascending: false });

    if (lErr) console.error('[loot] fetch', lErr);

    const loot = (lootRaw || []).map((lb) => ({
      id: lb.id,
      rarity: lb.rarity ?? 'unknown',
      status: lb.status ?? 'pending',
      created_at: lb.created_at,
    }));

    return { achievements: achievements || [], loot };
  }

  // ---------- render ----------
  function renderAchievements(list) {
    const wrap = $('awardsList');
    if (!wrap) return;
    if (!list.length) {
      wrap.innerHTML = `<div class="tinybars">No achievements yet.</div>`;
      return;
    }
    wrap.innerHTML = list
      .map(
        (a) => `
      <div class="row">
        <div>
          <div><strong>${escapeHtml(a.title)}</strong></div>
          ${a.description ? `<div>${escapeHtml(a.description)}</div>` : ``}
          <div class="meta">${new Date(a.awarded_at).toLocaleString()}</div>
        </div>
        <div></div>
      </div>
    `
      )
      .join('');
  }

  function renderLoot(list) {
    const wrap = $('lootList');
    const badge = $('lootBadge');
    if (!wrap) return;

    const pending = list.filter((x) => x.status === 'pending');

    // badge
    if (badge) {
      if (pending.length > 0) {
        badge.textContent = String(pending.length);
        badge.style.display = '';
      } else {
        badge.style.display = 'none';
      }
    }

    if (!list.length) {
      wrap.innerHTML = `<div class="tinybars">No loot boxes yet.</div>`;
      return;
    }

    wrap.innerHTML = list
      .map(
        (lb) => `
      <div class="row">
        <div>
          <div>${cap(lb.rarity)} Box — ${
          lb.status === 'pending' ? '<em>Unopened</em>' : 'Opened'
        }</div>
          <div class="meta">${new Date(lb.created_at).toLocaleString()}</div>
        </div>
        <div>
          ${
            lb.status === 'pending'
              ? `<button class="btn-ghost" data-open-loot="${lb.id}">Open</button>`
              : ``
          }
        </div>
      </div>
    `
      )
      .join('');
  }

  async function render(characterId) {
    const { achievements, loot } = await fetchAwardsAndLoot(characterId);
    renderAchievements(achievements);
    renderLoot(loot);
  }

  // ---------- realtime ----------
  function subscribe(characterId) {
    if (!sb) return;

    // Achievements: new rows
    sb.channel('achievements:' + characterId)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'achievements',
          filter: `character_id=eq.${characterId}`,
        },
        () => render(characterId)
      )
      .subscribe();

    // Loot boxes: watch inserts & updates (status changes when opened)
    sb.channel('loot_boxes:' + characterId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'loot_boxes',
          filter: `character_id=eq.${characterId}`,
        },
        () => render(characterId)
      )
      .subscribe();
  }

  // ---------- actions ----------
  async function openLootBox(lootBoxId) {
    if (!sb) return;
    // Requires an RPC that: validates ownership, rolls items, updates status='opened', returns loot
    const { data, error } = await sb.rpc('rpc_open_loot_box', {
      p_loot_box_id: lootBoxId,
    });
    if (error) {
      console.error('[loot] open', error);
      window.setText?.('msg', 'Failed to open loot box.');
      return;
    }
    const chId = window.AppState?.character?.id;
    if (chId) {
      // refresh inventory and re-render lists/badge
      window.App?.Features?.inventory?.load?.(chId, { force: true });
      await render(chId);
    }
    // Optional: reveal modal
    // window.App?.UI?.showLootReveal?.(data);
  }

  // ---------- expose ----------
  window.App = window.App || {};
  window.App.Features = window.App.Features || {};
  window.App.Features.awards = {
    render,
    subscribe,
    openLootBox,
  };
})();

// /js/features/awards-loot.js
(() => {
  const sb = window.sb; // your Supabase client
  const $ = (id) => document.getElementById(id);

  function esc(s) {
    return String(s).replace(
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
    s = String(s || '');
    return s ? s[0].toUpperCase() + s.slice(1) : '';
  }

  async function fetchAwardsAndLoot(characterId) {
    const [{ data: awards, error: aErr }, { data: loot, error: lErr }] =
      await Promise.all([
        sb
          .from('awards')
          .select('id, description, created_at')
          .eq('character_id', characterId)
          .order('created_at', { ascending: false }),
        sb
          .from('loot_boxes')
          .select('id, rarity, status, created_at')
          .eq('character_id', characterId)
          .order('created_at', { ascending: false }),
      ]);
    if (aErr) console.error('[awards] fetch', aErr);
    if (lErr) console.error('[loot] fetch', lErr);
    return { awards: awards || [], loot: loot || [] };
  }

  function renderAwardsList(awards) {
    const wrap = $('awardsList');
    if (!wrap) return;
    if (!awards.length) {
      wrap.innerHTML = `<div class="tinybars">No achievements yet.</div>`;
      return;
    }
    wrap.innerHTML = awards
      .map(
        (a) => `
      <div class="row">
        <div>
          <div>${a.description ? esc(a.description) : '(Achievement)'}</div>
          <div class="meta">${new Date(a.created_at).toLocaleString()}</div>
        </div>
        <div></div>
      </div>
    `
      )
      .join('');
  }

  function renderLootList(loot) {
    const wrap = $('lootList');
    const badge = $('lootBadge');
    if (!wrap) return;

    const pending = loot.filter((x) => x.status === 'pending');
    if (badge) {
      if (pending.length > 0) {
        badge.textContent = String(pending.length);
        badge.style.display = '';
      } else {
        badge.style.display = 'none';
      }
    }

    if (!loot.length) {
      wrap.innerHTML = `<div class="tinybars">No loot boxes yet.</div>`;
      return;
    }

    wrap.innerHTML = loot
      .map(
        (lb) => `
      <div class="row">
        <div>
          <div>${cap(lb.rarity)} Box ${
          lb.status === 'pending' ? '— <em>Unopened</em>' : '— Opened'
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
    const { awards, loot } = await fetchAwardsAndLoot(characterId);
    renderAwardsList(awards);
    renderLootList(loot);
  }

  function subscribe(characterId) {
    // Awards inserts
    sb.channel('awards:' + characterId)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'awards',
          filter: `character_id=eq.${characterId}`,
        },
        () => render(characterId)
      )
      .subscribe();

    // Loot inserts
    sb.channel('loot_boxes:' + characterId)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'loot_boxes',
          filter: `character_id=eq.${characterId}`,
        },
        () => render(characterId)
      )
      .subscribe();
  }

  async function openLootBox(lootBoxId) {
    const { data, error } = await sb.rpc('rpc_open_loot_box', {
      p_loot_box_id: lootBoxId,
    });
    if (error) {
      console.error('[loot] open', error);
      window.setText?.('msg', 'Failed to open loot box.');
      return;
    }
    // refresh inventory + this page
    const chId = window.AppState?.character?.id;
    if (chId) {
      window.App?.Features?.inventory?.load?.(chId, { force: true });
      await render(chId);
    }
    // optional: reveal UI
    // window.App?.UI?.showLootReveal?.(data);
  }

  // expose as a feature
  window.App = window.App || {};
  window.App.Features = window.App.Features || {};
  window.App.Features.awards = { render, subscribe, openLootBox };
})();

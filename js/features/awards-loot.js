// /js/features/awards-loot.js
(() => {
  // Use the actual Supabase client instance (not the SDK namespace)
  const sb = window.sb || window.supabaseClient || window.supabase?.client;
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
  function fmtDateOnly(ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  // ---------- data ----------
  async function fetchAwardsAndLoot(characterId) {
    if (!sb) return { achievements: [], loot: [] };

    // Achievements
    const { data: achievements, error: aErr } = await sb
      .from('achievements')
      .select('id, title, description, awarded_at')
      .eq('character_id', characterId)
      .order('awarded_at', { ascending: false });

    if (aErr) console.error('[awards] fetch', aErr);

    // Loot boxes
    const { data: lootRaw, error: lErr } = await sb
      .from('loot_boxes')
      .select('id, rarity, label, status, created_at, opened_at')
      .eq('character_id', characterId)
      .order('created_at', { ascending: false });

    if (lErr) console.error('[loot] fetch', lErr);

    const loot = (lootRaw || []).map((lb) => ({
      id: lb.id,
      rarity: lb.rarity ?? 'unknown',
      label: lb.label ?? null,
      status: lb.status ?? 'pending',
      created_at: lb.created_at,
      opened_at: lb.opened_at ?? null,
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
          <div class="meta">${fmtDateOnly(a.awarded_at)}</div>
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

    // badge shows count of unopened only
    if (badge) {
      if (pending.length > 0) {
        badge.textContent = String(pending.length);
        badge.style.display = '';
      } else {
        badge.style.display = 'none';
        badge.textContent = '';
      }
    }

    if (!list.length) {
      wrap.innerHTML = `<div class="tinybars">No loot boxes yet.</div>`;
      return;
    }

    wrap.innerHTML = list
      .map(
        (lb) => `
      <div class="row" data-loot-row="${lb.id}">
        <div>
          <div><strong>${escapeHtml(
            lb.label || `${cap(lb.rarity)} Box`
          )}</strong></div>
          <div class="meta">Granted: ${fmtDateOnly(lb.created_at)}</div>
        </div>
        <div>
          ${
            lb.status === 'pending'
              ? `<button class="btn-ghost" data-open-loot="${lb.id}">Open</button>`
              : `<span class="pill">Opened</span>`
          }
        </div>
      </div>
      <div class="reveal" id="lootReveal-${
        lb.id
      }" style="margin: 4px 0 0 0;"></div>
    `
      )
      .join('');
  }

  async function render(characterId) {
    if (!characterId) return;
    const { achievements, loot } = await fetchAwardsAndLoot(characterId);
    renderAchievements(achievements);
    renderLoot(loot);
  }

  // ---------- realtime ----------
  function subscribe(characterId) {
    if (!sb || !characterId) return;

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

    // Loot boxes: new box granted (INSERT). (We re-render after open via JS.)
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

  // ---------- actions ----------
  async function openLootBox(lootBoxId) {
    if (!sb || !lootBoxId) return;

    const { data, error } = await sb.rpc('rpc_open_loot_box', {
      p_loot_box_id: lootBoxId,
    });
    if (error) {
      console.error('[loot] open', error);
      window.setText?.('msg', 'Failed to open loot box.');
      return;
    }

    // Show reveal inline (list of items) if RPC returned them
    try {
      const items = Array.isArray(data) ? data : [];
      const host = document.getElementById(`lootReveal-${lootBoxId}`);
      if (host) {
        if (!items.length) {
          host.innerHTML = `<div class="tinybars">No items in this box.</div>`;
        } else {
          host.innerHTML = `
            <div class="list" style="margin-top:6px">
              ${items
                .map(
                  (it) => `
                <div class="row">
                  <div><strong>${escapeHtml(
                    it.name ?? `Item ${it.item_id}`
                  )}</strong></div>
                  <div class="pill">x${it.qty ?? 1}</div>
                </div>
              `
                )
                .join('')}
            </div>
          `;
        }
      }
    } catch (e) {
      console.warn('[loot] reveal render failed', e);
    }

    // Refresh to flip the button → "Opened" and update badge
    const chId = window.AppState?.character?.id;
    if (chId) await render(chId);
    // Optionally refresh inventory: App?.Features?.inventory?.load?.(chId, { force: true });
  }

  // ---------- expose ----------
  window.App = window.App || {};
  window.App.Features = window.App.Features || {};
  window.App.Features.awards = { render, subscribe, openLootBox };
})();

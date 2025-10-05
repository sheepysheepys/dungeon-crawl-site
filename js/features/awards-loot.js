// /js/features/awards-loot.js
(() => {
  // Supabase client (supports v2 or your wrapper)
  const sb =
    window.supabaseClient ||
    window.sb ||
    (window.supabase && window.supabase.client) ||
    window.supabase;

  if (!sb || typeof sb.from !== 'function') {
    console.error('[awards-loot] Supabase client missing.');
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

  // ---------- modal ----------
  function ensureModal() {
    let back = document.getElementById('lootRevealModal');
    if (back) return back;

    back = document.createElement('div');
    back.id = 'lootRevealModal';
    back.className = 'modal-backdrop';
    back.style.display = 'none';
    back.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="lootRevealTitle">
        <h3 id="lootRevealTitle" style="margin-top:0">Loot Box Opened</h3>
        <div id="lootRevealBody" class="list" style="max-height:60vh;overflow:auto;margin:8px 0"></div>
        <div class="row" style="justify-content:flex-end; gap:8px">
          <button id="lootRevealClose" class="btn">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(back);

    const close = () => (back.style.display = 'none');
    back.addEventListener('click', (e) => {
      if (e.target === back) close();
    });
    back.querySelector('#lootRevealClose').addEventListener('click', close);

    // Scoped, minimal styles so it doesn’t affect the rest of the UI
    if (!document.getElementById('awardsLootStyles')) {
      const st = document.createElement('style');
      st.id = 'awardsLootStyles';
      st.textContent = `
        #lootRevealModal.modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;
          align-items:center;justify-content:center;z-index:9999}
        #lootRevealModal .modal{background:#fff;color:#111;min-width:320px;max-width:540px;width:90%;
          border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.25);padding:12px}
        #lootRevealModal .btn{padding:6px 10px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer}
        #lootRevealModal .row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px dashed #eee}
        #lootRevealModal .row:last-child{border-bottom:none}
        #lootRevealModal .pill{display:inline-block;border:1px solid #ddd;border-radius:999px;padding:2px 8px;font-size:12px;margin-left:6px}
      `;
      document.head.appendChild(st);
    }

    return back;
  }

  function showRevealModal(items) {
    const back = ensureModal();
    const body = document.getElementById('lootRevealBody');
    const rows = (items || []).map((it) => {
      const name = it.item_name ?? it.name ?? `Item ${it.item_id}`;
      const qty = it.qty ?? 1;
      const drop = it.drop_rarity ?? it.rarity ?? '';
      return `
        <div class="row">
          <div><strong>${escapeHtml(
            name
          )}</strong> <span class="pill">x${qty}</span></div>
          <div>${
            drop ? `<span class="pill">${escapeHtml(drop)}</span>` : ''
          }</div>
        </div>`;
    });
    body.innerHTML = rows.length
      ? rows.join('')
      : `<div class="row"><div class="muted">No items.</div><div></div></div>`;
    back.style.display = 'flex';
  }

  // ---------- data ----------
  async function fetchAwardsAndLoot(characterId) {
    if (!sb) return { achievements: [], loot: [] };

    const [
      { data: achievements, error: aErr },
      { data: lootRaw, error: lErr },
    ] = await Promise.all([
      sb
        .from('achievements')
        .select('id, title, description, awarded_at')
        .eq('character_id', characterId)
        .order('awarded_at', { ascending: false }),
      sb
        .from('loot_boxes')
        .select('id, rarity, label, status, created_at, opened_at, contents')
        .eq('character_id', characterId)
        .order('created_at', { ascending: false }),
    ]);

    if (aErr) console.error('[awards] fetch', aErr);
    if (lErr) console.error('[loot] fetch', lErr);

    // Normalize status: treat 'pending' or 'unopened' as unopened
    const loot = (lootRaw || []).map((lb) => ({
      id: lb.id,
      rarity: lb.rarity ?? 'unknown',
      label: lb.label ?? null,
      status:
        lb.status === 'pending' || lb.status === 'unopened'
          ? 'unopened'
          : lb.status || 'opened',
      created_at: lb.created_at,
      opened_at: lb.opened_at ?? null,
      contents: lb.contents ?? null,
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

    const unopened = list.filter((x) => x.status === 'unopened');
    const opened = list.filter((x) => x.status === 'opened');

    // badge shows count of unopened only
    if (badge) {
      if (unopened.length > 0) {
        badge.textContent = String(unopened.length);
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

    // Pending / unopened first, then opened history compact
    const unopenedHtml = unopened
      .map(
        (lb) => `
      <div class="row" data-loot-row="${lb.id}">
        <div>
          <div><strong>${escapeHtml(
            lb.label || `${cap(lb.rarity)} Box`
          )}</strong> <span class="pill">${escapeHtml(lb.rarity)}</span></div>
          <div class="meta">Granted: ${fmtDateOnly(lb.created_at)}</div>
        </div>
        <div>
          <button class="btn-ghost" data-open-loot="${lb.id}">Open</button>
        </div>
      </div>
      <div class="reveal" id="lootReveal-${
        lb.id
      }" style="margin:4px 0 0 0;"></div>
    `
      )
      .join('');

    const openedHtml = opened
      .map((lb) => {
        // Build a one-line summary from saved snapshot if present
        const revealed = Array.isArray(lb.contents?.revealed)
          ? lb.contents.revealed
          : [];
        const summary = revealed
          .map((it) => {
            const nm = it.item_name ?? it.name ?? `Item ${it.item_id}`;
            const qty = it.qty ?? 1;
            return `${nm} x${qty}`;
          })
          .join(' • ');

        return `
          <div class="row">
            <div>
              <div><strong>${escapeHtml(
                lb.label || `${cap(lb.rarity)} Box`
              )}</strong> <span class="pill">${escapeHtml(
          lb.rarity
        )}</span></div>
              <div class="meta">Opened: ${fmtDateOnly(
                lb.opened_at || lb.created_at
              )}</div>
              ${
                summary
                  ? `<div class="meta" style="margin-top:2px">${escapeHtml(
                      summary
                    )}</div>`
                  : ``
              }
            </div>
            <div><span class="pill">Opened</span></div>
          </div>
        `;
      })
      .join('');

    wrap.innerHTML = `
      ${unopenedHtml || `<div class="tinybars">No unopened boxes.</div>`}
      ${
        openedHtml
          ? `<div class="tinybars" style="margin-top:8px">Opened</div>${openedHtml}`
          : ''
      }
    `;

    // Wire Open buttons
    wrap.querySelectorAll('[data-open-loot]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await openLootBox(btn.getAttribute('data-open-loot'));
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  async function render(characterId) {
    if (!characterId) return;
    const { achievements, loot } = await fetchAwardsAndLoot(characterId);
    renderAchievements(achievements);
    renderLoot(loot);
  }

  // ---------- realtime ----------
  let rtSub = null;
  function subscribe(characterId) {
    if (!sb || !characterId) return;

    if (rtSub) {
      try {
        rtSub.unsubscribe();
      } catch {}
      rtSub = null;
    }

    if (typeof sb.channel === 'function') {
      rtSub = sb
        .channel('loot_awards:' + characterId)
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
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'loot_boxes',
            filter: `character_id=eq.${characterId}`,
          },
          () => render(characterId)
        )
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
    } else {
      // v1 fallback
      rtSub = sb
        .from(`loot_boxes:character_id=eq.${characterId}`)
        .on('INSERT', () => render(characterId))
        .on('UPDATE', () => render(characterId))
        .subscribe();
    }
  }

  // ---------- actions ----------
  async function openLootBox(lootBoxId) {
    if (!sb || !lootBoxId) return;

    // Use the server-side grant RPC; it returns the reveal array
    const { data, error } = await sb.rpc('rpc_open_seeded_loot_box', {
      p_loot_box_id: lootBoxId,
      p_auto_grant: true,
    });
    if (error) {
      console.error('[loot] open', error);
      window.setText?.('msg', 'Failed to open loot box.');
      return;
    }

    // Reveal modal
    const items = Array.isArray(data) ? data : [];
    showRevealModal(items);

    // Refresh UI + inventory
    const chId = window.AppState?.character?.id;
    if (chId) {
      // Refresh this tab
      await render(chId);
      // Refresh inventory (if the Inventory feature exposes a loader)
      await window.App?.Features?.inventory?.load?.(chId, { force: true });
    }
  }

  // ---------- expose ----------
  window.App = window.App || {};
  window.App.Features = window.App.Features || {};
  window.App.Features.awards = { render, subscribe, openLootBox };
})();

// /js/features/achievements.js  (player view: Awards & Loot tab)
// Zero-polling, realtime-only, singleton subscriptions
(function () {
  window.App = window.App || { Features: {}, Logic: {} };
  window.AppState = window.AppState || {};

  // -------- Supabase client detection --------
  const sb =
    window.supabaseClient ||
    window.sb ||
    (window.supabase && window.supabase.client) ||
    window.supabase;

  if (!sb || typeof sb.from !== 'function') {
    console.error('[achievements] Supabase client missing.');
  }

  // -------- Small helpers --------
  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  };
  const fmt = (ts) => (ts ? new Date(ts).toLocaleString() : '');

  // page visibility + tab check
  const isDocVisible = () => !document.hidden;
  const isAwardsActive = () => {
    const pg = document.getElementById('page-awards');
    return !!pg && pg.classList.contains('active');
  };

  // Debounced refresh scheduler
  let refreshPending = false;
  let refreshTimer = null;
  function scheduleRefresh(delayMs = 200) {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      refreshTimer = null;
      if (isDocVisible() && isAwardsActive()) {
        await render(); // do the real work now
        refreshPending = false;
      } else {
        // Defer work until the user actually views the Awards tab again
        refreshPending = true;
      }
    }, delayMs);
  }

  // Ensure a tiny .hidden rule exists once (scoped)
  if (!document.querySelector('#globalHiddenRule')) {
    const st = document.createElement('style');
    st.id = 'globalHiddenRule';
    st.textContent = `.hidden{display:none}`;
    document.head.appendChild(st);
  }

  /* ===== SCOPED styles so nothing leaks to other pages/buttons ===== */
  function injectAwardsStyles() {
    if (document.getElementById('awardsScopedStyles')) return;
    const s = document.createElement('style');
    s.id = 'awardsScopedStyles';
    s.textContent = `
      /* ---------- Awards page only ---------- */
      #page-awards .btn        { padding:6px 10px; border-radius:8px; border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.08); color:#eaeaea; cursor:pointer }
      #page-awards .btn:hover  { filter: brightness(1.05) }
      #page-awards .btn-accent { border-color:#33caa6; background:#1fcaa4; color:#05231b; font-weight:600 }
      #page-awards .btn[disabled]{ opacity:.6; cursor:not-allowed }

      #page-awards .pill { display:inline-flex; align-items:center; gap:6px; line-height:1; border-radius:999px; padding:3px 8px; font-size:12px;
                           border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.06); color:#eaeaea }
      #page-awards .rarity-common    { background:#2b2f36; color:#e3e7ee; border-color:#373c44 }
      #page-awards .rarity-uncommon  { background:#113a2e; color:#b8f7d8; border-color:#1a5c47 }
      #page-awards .rarity-rare      { background:#16244e; color:#cfe0ff; border-color:#213774 }
      #page-awards .rarity-epic      { background:#2a174b; color:#e4d3ff; border-color:#3a1f68 }
      #page-awards .rarity-legendary { background:#4a2e00; color:#ffe7b3; border-color:#6b4300 }

      #page-awards .list .row { padding:4px 0; border-bottom:1px dashed rgba(255,255,255,.12) }
      #page-awards .list .row:last-child { border-bottom:none }
      #page-awards .muted { color:#a6adbb; font-size:12px }

      /* Opened boxes: condensed CHIP layout */
      #page-awards .loot-chips { display:flex; flex-wrap:wrap; gap:6px; margin-top:6px }
      #page-awards .loot-chip { display:inline-flex; align-items:center; gap:8px; max-width:100%;
                                border:1px solid rgba(255,255,255,.14); border-radius:10px; padding:6px 8px;
                                background:rgba(255,255,255,.05) }
      #page-awards .loot-chip .name { max-width:34ch; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
      #page-awards .loot-chip .qty  { font-size:12px; opacity:.9 }
      #page-awards .loot-chip .rar  { margin-left:4px }

      /* Expand/collapse details */
      #page-awards .expandable { cursor:pointer; }
      #page-awards .summary-line {
        margin-top: 4px; font-size: 12px; color: #a6adbb;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      #page-awards .expandable .details { display: none; margin-top: 6px; }
      #page-awards .expandable.open .details { display: block; }
      #page-awards .chev {
        display:inline-block; width:0; height:0; margin-left:6px;
        border-style: solid; border-width: 5px 0 5px 7px;
        border-color: transparent transparent transparent currentColor;
        transform: rotate(0deg); transition: transform .15s ease;
      }
      #page-awards .expandable.open .chev { transform: rotate(90deg); }
    `;
    document.head.appendChild(s);
  }

  /* ========== Modal + Confetti (scoped) ========== */
  function ensureModal() {
    let m = document.querySelector('#lootRevealModal');
    if (m) return m;

    m = document.createElement('div');
    m.id = 'lootRevealModal';
    m.className = 'modal-backdrop hidden';
    m.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="lootRevealTitle">
        <div class="modal-head" style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid #eee">
          <h3 id="lootRevealTitle" style="margin:0">Loot Box Opened</h3>
          <button class="btn-ghost" id="lootRevealClose" aria-label="Close">✕</button>
        </div>
        <div id="lootRevealBody" class="modal-body" style="padding:12px;max-height:60vh;overflow:auto"></div>
        <div class="modal-foot" style="display:flex;justify-content:flex-end;gap:8px;padding:10px 12px;border-top:1px solid #eee">
          <button class="btn" id="lootRevealOk">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(m);

    if (!document.getElementById('lootRevealStyles')) {
      const style = document.createElement('style');
      style.id = 'lootRevealStyles';
      style.textContent = `
        #lootRevealModal.modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:10000}
        #lootRevealModal.hidden{display:none}
        #lootRevealModal .modal{position:relative;background:#fff;color:#111;min-width:320px;max-width:540px;width:90%;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.25);overflow:hidden;z-index:10001}
        #lootRevealModal .btn{padding:6px 10px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer;color:#111}
        #lootRevealModal .btn-ghost{padding:4px 8px;border:none;background:transparent;cursor:pointer;color:#777}
        #lootRevealModal .pill{display:inline-flex;align-items:center;line-height:1;border:1px solid #e5e7eb;border-radius:999px;padding:2px 8px;font-size:12px;background:#f7f7f9;color:#111}
        #lootRevealModal .qty-pill{display:inline-flex;align-items:center;border:1px solid #e5e7eb;border-radius:999px;padding:2px 8px;font-size:12px;background:#fff;color:#111}
        #lootRevealModal .rarity-common{background:#f6f6f6}
        #lootRevealModal .rarity-uncommon{background:#e6f7ec}
        #lootRevealModal .rarity-rare{background:#e9f0ff}
        #lootRevealModal .rarity-epic{background:#f3e9ff}
        #lootRevealModal .rarity-legendary{background:#fff4d6}
        #lootRevealModal .muted{color:#666;font-size:12px}
        #lootRevealModal .row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px dashed #eee}
        #lootRevealModal .row:last-child{border-bottom:none}
        canvas.confetti-canvas, canvas#confetti-canvas { pointer-events:none !important; z-index:9998 !important; position:fixed !important; inset:0 !important; }
      `;
      document.head.appendChild(style);
    }

    const close = () => m.classList.add('hidden');
    m.querySelector('#lootRevealClose').addEventListener('click', close);
    m.querySelector('#lootRevealOk').addEventListener('click', close);
    m.addEventListener('click', (e) => {
      if (e.target === m) close();
    });
    document.addEventListener('keydown', (e) => {
      if (!m.classList.contains('hidden') && e.key === 'Escape') close();
    });
    m.querySelector('.modal').addEventListener('click', (e) =>
      e.stopPropagation()
    );

    return m;
  }

  function normalizeConfettiCanvases() {
    document
      .querySelectorAll('canvas.confetti-canvas, canvas#confetti-canvas')
      .forEach((c) => {
        c.style.pointerEvents = 'none';
        c.style.zIndex = '9998';
        c.style.position = 'fixed';
        c.style.inset = '0';
      });
  }

  async function fireConfetti() {
    if (!window.confetti) {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src =
          'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js';
        s.onload = res;
        s.onerror = rej;
        document.head.appendChild(s);
      });
    }
    window.confetti({
      particleCount: 70,
      spread: 70,
      startVelocity: 45,
      origin: { y: 0.3 },
    });
    normalizeConfettiCanvases();
  }

  /* ========== Data fetch ========== */
  async function fetchData(characterId) {
    const [ach, boxes] = await Promise.all([
      sb
        .from('achievements')
        .select('id,title,description,awarded_at')
        .eq('character_id', characterId)
        .order('awarded_at', { ascending: false }),
      sb
        .from('loot_boxes')
        .select('id,rarity,label,status,created_at,opened_at,contents')
        .eq('character_id', characterId)
        .order('created_at', { ascending: false }),
    ]);
    return { achievements: ach.data || [], boxes: boxes.data || [] };
  }

  /* ========== Rendering ========== */
  function rarityPill(rarity) {
    const span = el('span', `pill rarity-${rarity}`);
    span.textContent = rarity;
    return span;
  }

  function renderAchievements(list) {
    const wrap = $('#awardsList');
    if (!wrap) return;
    if (!list.length) {
      wrap.innerHTML = `<div class="muted">No achievements yet.</div>`;
      return;
    }
    wrap.innerHTML = list
      .map(
        (a) => `
      <div class="row">
        <div>
          <div><strong>${
            a.title ? String(a.title).replace(/[<>&]/g, '') : 'Achievement'
          }</strong></div>
          ${
            a.description
              ? `<div class="muted">${String(a.description).replace(
                  /[<>&]/g,
                  ''
                )}</div>`
              : ''
          }
          <div class="muted">${fmt(a.awarded_at)}</div>
        </div>
        <div></div>
      </div>
    `
      )
      .join('');
  }

  function ensureOpenedSection() {
    const awardsPage = $('#page-awards');
    if (!awardsPage) return null;
    let openedCard = awardsPage.querySelector('#openedLootCard');
    if (!openedCard) {
      openedCard = document.createElement('div');
      openedCard.className = 'card';
      openedCard.id = 'openedLootCard';
      openedCard.style.marginBottom = '16px';
      openedCard.innerHTML = `<h3 style="margin:0 0 8px">Opened Loot Boxes</h3><div id="openedLootList" class="list"></div>`;
      const achCard = awardsPage.querySelector('.card:nth-of-type(2)');
      if (achCard) awardsPage.insertBefore(openedCard, achCard);
      else awardsPage.appendChild(openedCard);
    }
    return openedCard.querySelector('#openedLootList');
  }

  function renderLoot(boxes) {
    const pendingWrap = $('#lootList');
    const openedWrap = ensureOpenedSection();
    const badge = $('#lootBadge');

    const unopened = boxes.filter(
      (b) => b.status === 'unopened' || b.status === 'pending'
    );
    const opened = boxes.filter((b) => b.status === 'opened');

    if (badge) {
      if (unopened.length > 0) {
        badge.textContent = String(unopened.length);
        badge.style.display = '';
      } else {
        badge.style.display = 'none';
        badge.textContent = '';
      }
    }

    // Pending
    if (pendingWrap) {
      if (!unopened.length) {
        pendingWrap.innerHTML = `<div class="muted">No unopened boxes.</div>`;
      } else {
        pendingWrap.innerHTML = unopened
          .map(
            (b) => `
          <div class="row" data-loot-row="${b.id}">
            <div>
              <div><strong>${(
                b.label ||
                `${b.rarity[0].toUpperCase() + b.rarity.slice(1)} Box`
              ).replace(/[<>&]/g, '')}</strong></div>
              <div class="muted">${fmt(b.created_at)}</div>
            </div>
            <div><button class="btn btn-accent" data-open-loot="${
              b.id
            }">Open</button></div>
          </div>
        `
          )
          .join('');
      }
    }

    // Opened (expandable details)
    if (openedWrap) {
      if (!opened.length) {
        openedWrap.innerHTML = `<div class="muted">No opened boxes yet.</div>`;
      } else {
        openedWrap.innerHTML = opened
          .map((b) => {
            const revealed = Array.isArray(b.contents?.revealed)
              ? b.contents.revealed
              : [];
            const boxTitle = (
              b.label || `${b.rarity[0].toUpperCase() + b.rarity.slice(1)} Box`
            ).replace(/[<>&]/g, '');

            const summary =
              revealed
                .map((it) => {
                  const name = it.item_name ?? `Item ${it.item_id}`;
                  const qty = it.qty ?? 1;
                  return `${name} x${qty}`;
                })
                .join(' • ') || 'No items';

            const chips = revealed
              .map((it) => {
                const name =
                  (it.item_name ?? `Item ${it.item_id}`) +
                  (it.ability?.name ? ` (${it.ability.name})` : '');
                const qty = it.qty ?? 1;
                const drop = it.drop_rarity ?? 'common';
                return `
          <span class="loot-chip">
            <span class="name">${String(name).replace(/[<>&]/g, '')}</span>
            <span class="qty pill">x${qty}</span>
            <span class="pill rar rarity-${drop}">${drop}</span>
          </span>`;
              })
              .join('');

            const id = `opened-${b.id}`;
            return `
        <div id="${id}" class="row expandable" data-expand="${id}" role="button" aria-expanded="false"
             style="flex-direction:column; align-items:stretch;">
          <div class="row" style="justify-content:space-between; border-bottom:none; padding:0;">
            <div>
              <strong>${boxTitle}</strong>
              <span class="pill">${b.rarity}</span>
              <span class="chev" aria-hidden="true"></span>
              <span class="muted openhide-label" style="margin-left:6px">Open</span>
            </div>
            <div class="muted">${fmt(b.opened_at || b.created_at)}</div>
          </div>
          <div class="summary-line">${summary}</div>
          <div class="details" style="display:none; margin-top:6px">
            <div class="loot-chips">${
              chips || `<span class="muted">No snapshot found.</span>`
            }</div>
          </div>
        </div>
      `;
          })
          .join('');

        openedWrap.querySelectorAll('[data-expand]').forEach((row) => {
          row.addEventListener('click', (e) => {
            if (e.target.closest('button,a')) return;
            const details = row.querySelector('.details');
            const label = row.querySelector('.openhide-label');
            const chev = row.querySelector('.chev');
            const isOpen = details.style.display !== 'none';
            details.style.display = isOpen ? 'none' : 'block';
            row.classList.toggle('open', !isOpen);
            row.setAttribute('aria-expanded', !isOpen ? 'true' : 'false');
            if (label) label.textContent = isOpen ? 'Open' : 'Hide';
            if (chev)
              chev.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(90deg)';
          });
        });
      }
    }

    // Wire Open buttons
    if (pendingWrap) {
      pendingWrap.querySelectorAll('[data-open-loot]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            await openBox(btn.getAttribute('data-open-loot'));
          } finally {
            btn.disabled = false;
          }
        });
      });
    }
  }

  /* ========== Open flow (RPC + modal) ========== */
  async function openBox(lootBoxId) {
    if (!lootBoxId) return;
    const { data, error } = await sb.rpc('rpc_open_seeded_loot_box', {
      p_loot_box_id: lootBoxId,
      p_auto_grant: true,
    });
    if (error) {
      console.error('[achievements] openBox error', error);
      const msg = $('#msg');
      if (msg) msg.textContent = 'Failed to open loot box.';
      return;
    }
    const items = Array.isArray(data) ? data : [];

    const modal = ensureModal();
    const body = $('#lootRevealBody');
    body.innerHTML = items.length
      ? items
          .map((it) => {
            const name = it.item_name ?? `Item ${it.item_id}`;
            const qty = it.qty ?? 1;
            const drop = it.drop_rarity ?? '';
            const base = it.base_rarity ?? '';
            const abil = it.ability?.name
              ? ` • Ability: ${it.ability.name}`
              : '';
            return `
            <div class="row">
              <div>
                <div><strong>${String(name).replace(
                  /[<>&]/g,
                  ''
                )}</strong> <span class="qty-pill">x${qty}</span>
                <div class="muted">Drop: ${drop} • Base: ${base}${abil}</div>
              </div>
              <div>${rarityPill(drop).outerHTML}</div>
            </div>`;
          })
          .join('')
      : `<div class="muted">No items in this box.</div>`;

    modal.classList.remove('hidden');
    fireConfetti();
    normalizeConfettiCanvases();

    // Trigger a refresh (deferred if Awards tab not active)
    scheduleRefresh(0);

    // refresh inventory UI if available
    const chId = window.AppState?.character?.id;
    if (window.App?.Features?.inventory?.load && chId) {
      try {
        await window.App.Features.inventory.load(chId, { force: true });
      } catch {}
    }
    // Broadcast a client event for any listeners
    items.forEach((it) => {
      window.dispatchEvent(
        new CustomEvent('inventory:add', {
          detail: { name: it.item_name, qty: it.qty },
        })
      );
    });
  }

  /* ========== Realtime (singleton) ========== */
  // --- replace the entire unsubscribeRealtime() with this ---
  async function unsubscribeRealtime() {
    const chans = [window.AppState?.achievementsCh, window.AppState?.lootCh];

    for (const ch of chans) {
      try {
        if (ch && typeof ch.unsubscribe === 'function') {
          await ch.unsubscribe(); // v2-safe
        }
      } catch (e) {
        console.warn('[achievements] unsubscribeRealtime', e);
      }
    }

    window.AppState.achievementsCh = null;
    window.AppState.lootCh = null;
    window.AppState._awardsSubFor = null;
  }

  // --- replace the entire subscribeRealtime() with this ---
  function subscribeRealtime(characterId) {
    if (!characterId || !sb) return;

    // If we already have subscriptions for this character, do nothing
    if (
      window.AppState._awardsSubFor === characterId &&
      (window.AppState.achievementsCh || window.AppState.lootCh)
    ) {
      return;
    }

    // Clean any old channels (defensive; safe if none exist)
    unsubscribeRealtime(); // note: it's async, but we don't need to await here

    if (typeof sb.channel === 'function') {
      // achievements INSERTs
      window.AppState.achievementsCh = sb
        .channel('achievements:' + characterId)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'achievements',
            filter: `character_id=eq.${characterId}`,
          },
          () => scheduleRefresh()
        )
        .subscribe();

      // loot_boxes INSERT/UPDATE
      window.AppState.lootCh = sb
        .channel('loot_boxes:' + characterId)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'loot_boxes',
            filter: `character_id=eq.${characterId}`,
          },
          () => scheduleRefresh()
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'loot_boxes',
            filter: `character_id=eq.${characterId}`,
          },
          () => scheduleRefresh()
        )
        .subscribe();
    } else {
      console.warn('[achievements] Realtime channel API not available');
    }

    window.AppState._awardsSubFor = characterId;
  }

  function subscribeRealtime(characterId) {
    if (!characterId || !sb) return;
    // Idempotent: if already subscribed for this character, skip
    if (
      window.AppState._awardsSubFor === characterId &&
      (window.AppState.achievementsCh || window.AppState.lootCh)
    ) {
      return;
    }

    unsubscribeRealtime();

    if (typeof sb.channel === 'function') {
      // achievements INSERTs
      window.AppState.achievementsCh = sb
        .channel('achievements:' + characterId)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'achievements',
            filter: `character_id=eq.${characterId}`,
          },
          () => scheduleRefresh()
        )
        .subscribe();

      // loot_boxes INSERT/UPDATE
      window.AppState.lootCh = sb
        .channel('loot_boxes:' + characterId)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'loot_boxes',
            filter: `character_id=eq.${characterId}`,
          },
          () => scheduleRefresh()
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'loot_boxes',
            filter: `character_id=eq.${characterId}`,
          },
          () => scheduleRefresh()
        )
        .subscribe();
    } else {
      // (legacy supabase-js v1 could be handled here if you still need it)
      console.warn('[achievements] Realtime channel API not available');
    }

    window.AppState._awardsSubFor = characterId;
  }

  /* ========== Orchestration ========== */
  async function render() {
    injectAwardsStyles();
    const charId = window.AppState?.character?.id;
    if (!charId || !sb) return;

    // Only render heavy DOM when the page is active
    if (!isAwardsActive()) return;

    const { achievements, boxes } = await fetchData(charId);
    renderLoot(boxes);
    renderAchievements(achievements);
  }

  // Re-render when user makes the Awards tab visible again (if we deferred)
  document.addEventListener('visibilitychange', () => {
    if (isDocVisible() && isAwardsActive() && refreshPending) {
      scheduleRefresh(0);
    }
  });

  // Watch tab switches (your tabs flip .active on #page-*)
  document.addEventListener('click', (e) => {
    const t = e.target.closest('.tab');
    if (!t) return;
    const tabName = t.dataset.page || t.dataset.tab;
    if (tabName === 'awards') {
      // Ensure realtime is connected and render (or catch up if deferred)
      const charId = window.AppState?.character?.id;
      if (charId) subscribeRealtime(charId);
      scheduleRefresh(0);
    }
  });

  // Initial boot: when character becomes ready, wire realtime once
  window.addEventListener('character:ready', () => {
    const charId = window.AppState?.character?.id;
    if (!charId) return;
    subscribeRealtime(charId);
    // Only render now if Awards is already the visible tab; otherwise wait
    if (isAwardsActive()) scheduleRefresh(0);
  });

  // Public surface (what character.js expects)
  window.App.Features.awards = {
    render: () => scheduleRefresh(0),
    openLootBox: (lootBoxId) => {
      try {
        return openBox(lootBoxId);
      } catch (e) {
        console.warn('[awards] openLootBox failed', e);
        return null;
      }
    },
    subscribe: (characterId) => subscribeRealtime(characterId), // no-op if already subscribed
  };

  // Optional: manual init if DOM loads with Awards visible
  document.addEventListener('DOMContentLoaded', () => {
    if (isAwardsActive()) {
      const charId = window.AppState?.character?.id;
      if (charId) subscribeRealtime(charId);
      scheduleRefresh(0);
    }
  });
})();

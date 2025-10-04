// /js/features/achievements.js  (player view: Awards & Loot tab)
(function () {
  window.App = window.App || { Features: {}, Logic: {} };

  // Supabase client (v2 or your wrapper)
  const sb =
    window.supabaseClient ||
    window.sb ||
    (window.supabase && window.supabase.client) ||
    window.supabase;

  if (!sb || typeof sb.from !== 'function') {
    console.error('[achievements] Supabase client missing.');
  }

  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  };
  const fmt = (ts) => (ts ? new Date(ts).toLocaleString() : '');

  // ensure .hidden exists once
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
      #page-awards .show-toggle { margin-top:6px }
      #page-awards .show-toggle .btn { font-size:12px; padding:4px 8px }
         #page-awards .show-toggle { margin-top:6px }
   #page-awards .show-toggle .btn { font-size:12px; padding:4px 8px }

+  /* Opened rows: compact by default with one-line summary */
+  #page-awards .expandable { cursor: pointer; }
+  #page-awards .summary-line {
+    margin-top: 4px;
+    font-size: 12px;
+    color: #a6adbb;
+    white-space: nowrap;
+    overflow: hidden;
+    text-overflow: ellipsis;
+  }
+  #page-awards .expandable .details { display: none; margin-top: 6px; }
+  #page-awards .expandable.open .details { display: block; }
+  #page-awards .chev {
+    display:inline-block; width: 0; height: 0; margin-left: 6px;
+    border-style: solid; border-width: 5px 0 5px 7px;
+    border-color: transparent transparent transparent currentColor;
+    transform: rotate(0deg); transition: transform .15s ease;
+  }
+  #page-awards .expandable.open .chev { transform: rotate(90deg); }

    `;
    document.head.appendChild(s);
  }

  /* ========== Modal + Confetti (fully scoped) ========== */
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

    // Strong, fully scoped modal styles
    if (!document.getElementById('lootRevealStyles')) {
      const style = document.createElement('style');
      style.id = 'lootRevealStyles';
      style.textContent = `
        #lootRevealModal.modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:10000}
        #lootRevealModal.hidden{display:none}
        #lootRevealModal .modal{position:relative;background:#fff;color:#111;min-width:320px;max-width:540px;width:90%;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.25);overflow:hidden;z-index:10001}

        #lootRevealModal .btn{padding:6px 10px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer}
        #lootRevealModal .btn-ghost{padding:4px 8px;border:none;background:transparent;cursor:pointer}

        #lootRevealModal .pill{display:inline-block;border:1px solid #ddd;border-radius:999px;padding:2px 8px;font-size:12px;margin-left:6px}
        #lootRevealModal .rarity-common{background:#f6f6f6}
        #lootRevealModal .rarity-uncommon{background:#e6f7ec}
        #lootRevealModal .rarity-rare{background:#e9f0ff}
        #lootRevealModal .rarity-epic{background:#f3e9ff}
        #lootRevealModal .rarity-legendary{background:#fff4d6}

        #lootRevealModal .muted{color:#666;font-size:12px}
        #lootRevealModal .row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px dashed #eee}
        #lootRevealModal .row:last-child{border-bottom:none}

        /* confetti canvas: keep under modal and click-through */
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

  /* ========== Data ========== */
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

    const unopened = boxes.filter((b) => b.status === 'unopened');
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

    // Opened (condensed chips)
    // Opened (summary line + expandable details)
    if (openedWrap) {
      if (!opened.length) {
        openedWrap.innerHTML = `<div class="muted">No opened boxes yet.</div>`;
      } else {
        openedWrap.innerHTML = opened
          .map((b) => {
            const revealed = Array.isArray(b.contents?.revealed)
              ? b.contents.revealed
              : [];

            // Build chips + a single-line summary like: "Torch x2 • Copper Coins x14 • Rune Shard x1"
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
          </span>
        `;
              })
              .join('');

            const summary = revealed
              .map((it) => {
                const name =
                  (it.item_name ?? `Item ${it.item_id}`) +
                  (it.ability?.name ? ` (${it.ability.name})` : '');
                const qty = it.qty ?? 1;
                return `${name} x${qty}`;
              })
              .join(' • ');

            const boxTitle = (
              b.label || `${b.rarity[0].toUpperCase() + b.rarity.slice(1)} Box`
            ).replace(/[<>&]/g, '');
            const rowId = `opened-${b.id}`;

            return `
        <div id="${rowId}" class="row expandable" data-expand="${rowId}" role="button" aria-expanded="false"
             style="flex-direction:column; align-items:stretch">
          <div class="row" style="justify-content:space-between; border-bottom:none; padding:0 0 2px 0">
            <div>
              <strong>${boxTitle}</strong>
              <span class="pill">${b.rarity}</span>
              <span class="chev" aria-hidden="true"></span>
            </div>
            <div class="muted">${fmt(b.opened_at || b.created_at)}</div>
          </div>

          <!-- One-line summary -->
          <div class="summary-line">${summary || '—'}</div>

          <!-- Full details (chips), hidden until expanded -->
          <div class="details">
            <div class="loot-chips">${
              chips ||
              `<span class="muted">No snapshot found for this box.</span>`
            }</div>
          </div>
        </div>
      `;
          })
          .join('');

        // wire expand/collapse (click row or chevron area)
        openedWrap.querySelectorAll('[data-expand]').forEach((row) => {
          row.addEventListener('click', (e) => {
            // ignore clicks on links/buttons if you ever add them
            if (e.target.closest('button,a')) return;
            const open = !row.classList.contains('open');
            row.classList.toggle('open', open);
            row.setAttribute('aria-expanded', open ? 'true' : 'false');
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
                )}</strong> <span class="pill">x${qty}</span></div>
                <div class="muted">Drop: ${drop} • Base: ${base}${abil}</div>
              </div>
              <div>${rarityPill(drop).outerHTML}</div>
            </div>
          `;
          })
          .join('')
      : `<div class="muted">No items in this box.</div>`;

    modal.classList.remove('hidden');
    fireConfetti();
    normalizeConfettiCanvases();

    // move Unopened → Opened
    await render();

    // refresh inventory UI if available
    const chId = window.AppState?.character?.id;
    if (window.App?.Features?.inventory?.load && chId) {
      try {
        await window.App.Features.inventory.load(chId, { force: true });
      } catch {}
    }
    // also broadcast a client event for any listeners
    items.forEach((it) => {
      window.dispatchEvent(
        new CustomEvent('inventory:add', {
          detail: { name: it.item_name, qty: it.qty },
        })
      );
    });
  }

  /* ========== Realtime + Poll fallback ========== */
  let rtSubV2 = null;
  let rtSubV1 = null;
  let pollTimer = null;

  function unsubscribeRealtime() {
    try {
      rtSubV2?.unsubscribe();
    } catch {}
    try {
      rtSubV1?.unsubscribe?.();
    } catch {}
    rtSubV2 = null;
    rtSubV1 = null;
  }

  function subscribe(characterId) {
    if (!characterId || !sb) return;
    unsubscribeRealtime();
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }

    if (typeof sb.channel === 'function') {
      rtSubV2 = sb
        .channel('loot_boxes:' + characterId)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'loot_boxes',
            filter: `character_id=eq.${characterId}`,
          },
          () => render()
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'loot_boxes',
            filter: `character_id=eq.${characterId}`,
          },
          () => render()
        )
        .subscribe();
    } else if (typeof sb.from === 'function') {
      rtSubV1 = sb
        .from(`loot_boxes:character_id=eq.${characterId}`)
        .on('INSERT', () => render())
        .on('UPDATE', () => render())
        .subscribe();
    }

    // safety net
    pollTimer = setInterval(() => render(), 5000);
  }

  /* ========== Orchestration ========== */
  async function render() {
    injectAwardsStyles();
    const charId = window.AppState?.character?.id;
    if (!charId || !sb) return;

    const { achievements, boxes } = await fetchData(charId);
    renderLoot(boxes);
    renderAchievements(achievements);

    subscribe(charId);
  }

  document.addEventListener('DOMContentLoaded', render);
  window.App.Features.Achievements = { render };

  // --- Back-compat shim for character.js expecting App.Features.awards ---
  window.App.Features.awards = {
    render: () => window.App.Features.Achievements?.render?.(),
    openLootBox: (lootBoxId) => {
      try {
        return openBox(lootBoxId);
      } catch (e) {
        console.warn('[awards shim] openLootBox failed', e);
        return null;
      }
    },
    subscribe: () => {},
  };
})();

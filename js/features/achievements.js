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

  /* ========== Modal + Confetti ========== */
  function ensureModal() {
    let m = $('#lootRevealModal');
    if (m) return m;
    m = el('div', 'modal-backdrop hidden');
    m.id = 'lootRevealModal';
    m.innerHTML = `
      <div class="modal">
        <div class="modal-head" style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid #eee">
          <h3 style="margin:0">Loot Box Opened</h3>
          <button class="btn-ghost" id="lootRevealClose" aria-label="Close">✕</button>
        </div>
        <div id="lootRevealBody" class="modal-body" style="padding:12px;max-height:60vh;overflow:auto"></div>
        <div class="modal-foot" style="display:flex;justify-content:flex-end;gap:8px;padding:10px 12px;border-top:1px solid #eee">
          <button class="btn" id="lootRevealOk">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(m);

    // minimal styles if not present
    const style = document.createElement('style');
    style.textContent = `
      .modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999}
      .modal{background:#fff;color:#111;min-width:320px;max-width:540px;width:90%;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.25);overflow:hidden}
      .btn{padding:6px 10px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer}
      .btn-ghost{padding:4px 8px;border:none;background:transparent;cursor:pointer}
      .pill{display:inline-block;border:1px solid #ddd;border-radius:999px;padding:2px 8px;font-size:12px;margin-left:6px}
      .rarity-common{background:#f6f6f6}
      .rarity-uncommon{background:#e6f7ec}
      .rarity-rare{background:#e9f0ff}
      .rarity-epic{background:#f3e9ff}
      .rarity-legendary{background:#fff4d6}
      .muted{color:#666;font-size:12px}
      .row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px dashed #eee}
      .row:last-child{border-bottom:none}
      .list .row{padding:6px 0}
    `;
    document.head.appendChild(style);

    const close = () => m.classList.add('hidden');
    m.querySelector('#lootRevealClose').addEventListener('click', close);
    m.querySelector('#lootRevealOk').addEventListener('click', close);
    return m;
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
    const end = Date.now() + 500;
    (function frame() {
      window.confetti({
        particleCount: 60,
        spread: 70,
        startVelocity: 45,
        scalar: 0.9,
        ticks: 120,
        origin: { y: 0.3 },
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
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
    return {
      achievements: ach.data || [],
      boxes: boxes.data || [],
    };
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
    // Insert an "Opened Loot Boxes" card above the Achievements card if not present
    const awardsPage = $('#page-awards');
    if (!awardsPage) return null;
    let openedCard = awardsPage.querySelector('#openedLootCard');
    if (!openedCard) {
      openedCard = document.createElement('div');
      openedCard.className = 'card';
      openedCard.id = 'openedLootCard';
      openedCard.style.marginBottom = '16px';
      openedCard.innerHTML = `
        <h3 style="margin:0 0 8px">Opened Loot Boxes</h3>
        <div id="openedLootList" class="list"></div>
      `;
      // Insert before the Achievements card
      const achCard = awardsPage.querySelector('.card:nth-of-type(2)'); // your second card is Achievements
      if (achCard) awardsPage.insertBefore(openedCard, achCard);
      else awardsPage.appendChild(openedCard);
    }
    return openedCard.querySelector('#openedLootList');
  }

  function renderLoot(boxes) {
    const pendingWrap = $('#lootList'); // Pending Loot Boxes
    const openedWrap = ensureOpenedSection(); // Opened list container
    const badge = $('#lootBadge');

    const unopened = boxes.filter((b) => b.status === 'unopened');
    const opened = boxes.filter((b) => b.status === 'opened');

    // badge shows unopened count
    if (badge) {
      if (unopened.length > 0) {
        badge.textContent = String(unopened.length);
        badge.style.display = '';
      } else {
        badge.style.display = 'none';
        badge.textContent = '';
      }
    }

    // Pending (unopened)
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

    // Opened + revealed contents
    if (openedWrap) {
      if (!opened.length) {
        openedWrap.innerHTML = `<div class="muted">No opened boxes yet.</div>`;
      } else {
        openedWrap.innerHTML = opened
          .map((b) => {
            const revealed = Array.isArray(b.contents?.revealed)
              ? b.contents.revealed
              : [];
            const itemsHtml = revealed.length
              ? revealed
                  .map((it) => {
                    const name = it.item_name ?? `Item ${it.item_id}`;
                    const qty = it.qty ?? 1;
                    const drop = it.drop_rarity ?? '';
                    const base = it.base_rarity ?? '';
                    const abil = it.ability?.name
                      ? ` • Ability: ${it.ability.name}`
                      : '';
                    return `
                  <div class="row" style="padding:4px 0;border-bottom:1px dashed #eee;">
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
              : `<div class="muted">No snapshot found for this box.</div>`;
            return `
            <div class="row" style="flex-direction:column;align-items:stretch">
              <div class="row" style="justify-content:space-between;border-bottom:none;padding:0 0 6px 0">
                <div>
                  <strong>${(
                    b.label ||
                    `${b.rarity[0].toUpperCase() + b.rarity.slice(1)} Box`
                  ).replace(/[<>&]/g, '')}</strong>
                  <span class="pill">${b.rarity}</span>
                </div>
                <div class="muted">${fmt(b.opened_at || b.created_at)}</div>
              </div>
              <div class="list" style="margin-top:6px">${itemsHtml}</div>
            </div>
          `;
          })
          .join('');
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
    //fireConfetti();
    await render(); // move Unopened → Opened + update lists/badge
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
          () => {
            /* console.log('[rt] INSERT → render'); */ render();
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'loot_boxes',
            filter: `character_id=eq.${characterId}`,
          },
          () => {
            /* console.log('[rt] UPDATE → render'); */ render();
          }
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
    const charId = window.AppState?.character?.id;
    if (!charId || !sb) return;

    const { achievements, boxes } = await fetchData(charId);
    renderLoot(boxes);
    renderAchievements(achievements);

    // attach realtime after first render (idempotent)
    subscribe(charId);
  }

  document.addEventListener('DOMContentLoaded', render);
  window.App.Features.Achievements = { render };

  // --- Back-compat shim for character.js expecting App.Features.awards ---
  window.App = window.App || { Features: {} };
  window.App.Features = window.App.Features || {};

  // Expose the same API the old awards-loot.js provided
  window.App.Features.awards = {
    // character.js calls awards.render() when switching to the Awards tab
    render: () => {
      // delegate to the new module’s render (same behaviour)
      return window.App.Features.Achievements?.render?.();
    },
    // Some old code might call awards.openLootBox(id). Keep it working:
    openLootBox: (lootBoxId) => {
      // call the new open flow (uses seeded contents + modal)
      try {
        // openBox is in-scope inside this file, so we can call it directly
        return typeof openBox === 'function' ? openBox(lootBoxId) : null;
      } catch (e) {
        console.warn('[awards shim] openLootBox failed', e);
        return null;
      }
    },
    // Not needed anymore (we handle realtime inside achievements.js), but keep a no-op:
    subscribe: () => {},
  };
})();

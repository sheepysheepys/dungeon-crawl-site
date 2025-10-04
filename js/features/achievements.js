(function () {
  window.App = window.App || { Features: {}, Logic: {} };
  const supa = window.supabase; // from /js/supabase-client.js

  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  };
  const fmt = (ts) => (ts ? new Date(ts).toLocaleString() : '');

  // Always allow opening anywhere
  function isSafeArea() {
    return true;
  }

  /* ---------- Modal helpers ---------- */
  function ensureModal() {
    let m = $('#lootModal');
    if (m) return m;
    m = el('div', 'modal-backdrop hidden');
    m.id = 'lootModal';
    m.innerHTML = `
      <div class="modal">
        <div class="modal-head">
          <h3>Loot Box Opened</h3>
          <button class="btn-ghost" id="lootCloseBtn" aria-label="Close">✕</button>
        </div>
        <div id="lootModalBody" class="modal-body"></div>
        <div class="modal-foot">
          <button class="btn" id="lootOkBtn">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(m);

    const style = document.createElement('style');
    style.textContent = `
      .modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999}
      .modal{background:#fff;color:#111;min-width:320px;max-width:540px;width:90%;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.25);overflow:hidden}
      .modal-head,.modal-foot{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid #eee}
      .modal-foot{border-top:1px solid #eee;border-bottom:none;justify-content:flex-end}
      .modal-body{padding:12px;max-height:60vh;overflow:auto}
      .pill{display:inline-block;border:1px solid #ddd;border-radius:999px;padding:2px 8px;font-size:12px;margin-left:6px}
      .rarity-common{background:#f6f6f6}
      .rarity-uncommon{background:#e6f7ec}
      .rarity-rare{background:#e9f0ff}
      .rarity-epic{background:#f3e9ff}
      .rarity-legendary{background:#fff4d6}
      .row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px dashed #eee}
      .row:last-child{border-bottom:none}
      .btn{padding:6px 10px;border-radius:8px;border:1px solid #ccc;background:#fff}
      .btn-ghost{padding:4px 8px;border:none;background:transparent;cursor:pointer}
      .hidden{display:none}
      .muted{color:#666;font-size:12px}
    `;
    document.head.appendChild(style);

    const close = () => m.classList.add('hidden');
    $('#lootCloseBtn').addEventListener('click', close);
    $('#lootOkBtn').addEventListener('click', close);
    return m;
  }

  function rarityPill(rarity) {
    const span = el('span', `pill rarity-${rarity}`);
    span.textContent = rarity;
    return span;
  }

  async function fetchData(charId) {
    const [ach, boxes] = await Promise.all([
      supa
        .from('achievements')
        .select('*')
        .eq('character_id', charId)
        .order('created_at', { ascending: false }),
      supa
        .from('loot_boxes')
        .select('*')
        .eq('character_id', charId)
        .order('created_at', { ascending: false }),
    ]);
    return {
      achievements: ach.data || [],
      boxes: boxes.data || [],
    };
  }

  function addToInventory(name, qty) {
    const inv = window.App?.Logic?.Inventory;
    if (inv && typeof inv.addItem === 'function') {
      inv.addItem({ name, qty });
    } else {
      window.dispatchEvent(
        new CustomEvent('inventory:add', { detail: { name, qty } })
      );
    }
  }

  /* ---------- OPEN: instant RPC + modal reveal ---------- */
  async function openBox(box) {
    // Safe-area check removed; we always allow opening

    const { data, error } = await supa.rpc('rpc_open_seeded_loot_box', {
      p_loot_box_id: box.id,
      p_auto_grant: true,
    });
    if (error) {
      console.error('[achievements] openBox RPC error', error);
      const msg = $('#msg');
      if (msg) msg.textContent = 'Failed to open loot box.';
      return;
    }

    const items = Array.isArray(data) ? data : [];
    const modal = ensureModal();
    const body = $('#lootModalBody');
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
                <div><strong>${name}</strong> <span class="pill">x${qty}</span></div>
                <div class="muted">Drop: ${drop} • Base: ${base}${abil}</div>
              </div>
              <div>${rarityPill(drop).outerHTML}</div>
            </div>
          `;
          })
          .join('')
      : `<div class="muted">No items in this box.</div>`;
    modal.classList.remove('hidden');

    await render(); // move box from Unopened → Opened lists
  }

  /* ---------- UI helpers ---------- */
  function ensureContainers() {
    const card = $('#achievementsCard');
    if (!card) return {};
    let controls = card.querySelector('.ach-controls');
    if (!controls) {
      controls = el('div', 'ach-controls row');
      controls.style.justifyContent = 'space-between';
      controls.style.marginTop = '8px';
      const left = el('div', 'row');
      const label = el('label');
      label.textContent = 'View: ';
      const select = el('select');
      select.id = 'achView';
      [
        'All activity',
        'Achievements only',
        'Loot boxes only',
        'Unopened boxes',
        'Opened boxes',
      ].forEach((t, i) => {
        const opt = document.createElement('option');
        opt.value = ['all', 'achievements', 'boxes', 'unopened', 'opened'][i];
        opt.textContent = t;
        select.appendChild(opt);
      });
      left.append(label, select);
      controls.append(left);
      card.appendChild(controls);
    }
    let feed = card.querySelector('#achActivity');
    if (!feed) {
      feed = el('div');
      feed.id = 'achActivity';
      feed.className = 'list';
      feed.style.marginTop = '10px';
      card.appendChild(feed);
    }
    let panel = card.querySelector('.loot-panel');
    if (!panel) {
      panel = el('div', 'loot-panel');
      panel.style.marginTop = '14px';
      card.appendChild(panel);
    }
    return { card, controls, feed, panel };
  }

  function renderAchievementsFeed(feedEl, achievements, boxes, filter) {
    feedEl.innerHTML = '';
    const activity = [];

    achievements.forEach((a) => {
      activity.push({
        type: 'achievement',
        text: a.description,
        ts: a.created_at,
        node: (() => {
          const row = el('div', 'xp-row');
          const name = el('span', 'xp-name');
          name.textContent = a.description;
          const stamp = el('span', 'stamp');
          stamp.textContent = fmt(a.created_at);
          const notch = el('span', 'xp-notch');
          notch.setAttribute('aria-hidden', 'true');
          row.append(name, stamp, notch);
          return row;
        })(),
      });
    });

    boxes.forEach((b) => {
      activity.push({
        type: 'box-granted',
        status: b.status,
        rarity: b.rarity,
        ts: b.created_at,
        node: (() => {
          const row = el('div', 'xp-row');
          const name = el('span', 'xp-name');
          name.append('Loot Box ', rarityPill(b.rarity), ' granted');
          const stamp = el('span', 'stamp');
          stamp.textContent = fmt(b.created_at);
          const notch = el('span', 'xp-notch');
          notch.setAttribute('aria-hidden', 'true');
          row.append(name, stamp, notch);
          return row;
        })(),
      });
      if (b.status === 'opened' && b.opened_at) {
        activity.push({
          type: 'box-opened',
          status: b.status,
          rarity: b.rarity,
          ts: b.opened_at,
          node: (() => {
            const row = el('div', 'xp-row');
            const name = el('span', 'xp-name');
            name.append('Loot Box ', rarityPill(b.rarity), ' opened');
            const stamp = el('span', 'stamp');
            stamp.textContent = fmt(b.opened_at);
            const notch = el('span', 'xp-notch');
            notch.setAttribute('aria-hidden', 'true');
            row.append(name, stamp, notch);
            return row;
          })(),
        });
      }
    });

    const filtered = activity.filter((item) => {
      switch (filter) {
        case 'achievements':
          return item.type === 'achievement';
        case 'boxes':
          return item.type.startsWith('box-');
        case 'unopened':
          return item.type === 'box-granted' && item.status === 'unopened';
        case 'opened':
          return item.type === 'box-opened';
        default:
          return true;
      }
    });

    filtered.sort((a, b) => new Date(b.ts) - new Date(a.ts));

    if (!filtered.length) {
      const none = el('div', 'muted');
      none.textContent = 'No activity yet.';
      feedEl.appendChild(none);
      return;
    }
    filtered.forEach((item) => feedEl.appendChild(item.node));
  }

  function renderBoxesPanel(panelEl, boxes) {
    panelEl.innerHTML = '';
    const unopened = boxes.filter((b) => b.status === 'unopened');
    const opened = boxes.filter((b) => b.status === 'opened');

    const h1 = el('h3');
    h1.textContent = 'Unopened Loot Boxes';
    panelEl.appendChild(h1);

    if (!unopened.length) {
      const none = el('div', 'muted');
      none.textContent = 'No unopened boxes.';
      panelEl.appendChild(none);
    } else {
      unopened.forEach((b) => {
        const row = el('div', 'row');
        row.style.justifyContent = 'space-between';
        const left = el('div');
        left.append(
          'Loot Box ',
          rarityPill(b.rarity),
          ' • ',
          el('span', 'stamp')
        );
        left.querySelector('.stamp').textContent = fmt(b.created_at);

        const right = el('div', 'row');
        const btn = el('button', 'btn-accent');
        btn.textContent = 'Open';
        // no safe-area gating; we allow anywhere
        btn.addEventListener('click', async () => {
          btn.disabled = true; // prevent double clicks during RPC
          await openBox(b);
          btn.disabled = false;
        });
        right.append(btn);

        row.append(left, right);
        panelEl.appendChild(row);
      });
    }

    const h2 = el('h3');
    h2.textContent = 'Opened Boxes';
    h2.style.marginTop = '10px';
    panelEl.appendChild(h2);

    if (!opened.length) {
      const none = el('div', 'muted');
      none.textContent = 'No opened boxes yet.';
      panelEl.appendChild(none);
    } else {
      opened.forEach((b) => {
        const row = el('div', 'row');
        const left = el('div');
        left.append(
          'Loot Box ',
          rarityPill(b.rarity),
          ' • ',
          el('span', 'stamp')
        );
        left.querySelector('.stamp').textContent = fmt(
          b.opened_at || b.created_at
        );
        row.append(left);
        panelEl.appendChild(row);
      });
    }
  }

  async function render() {
    const char = window.AppState?.character;
    if (!char?.id) return;
    const { card, controls, feed, panel } = ensureContainers();
    if (!card) return;

    const { achievements, boxes } = await fetchData(char.id);

    const select = card.querySelector('#achView');
    const filter = select ? select.value : 'all';

    renderAchievementsFeed(feed, achievements, boxes, filter);
    renderBoxesPanel(panel, boxes);

    if (select && !select._bound) {
      select._bound = true;
      select.addEventListener('change', () => render());
    }
  }

  document.addEventListener('DOMContentLoaded', render);
  window.App.Features.Achievements = { render };
})();

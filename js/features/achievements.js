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

  function isSafeArea() {
    // Flip this true/false from your game logic
    return !!window.AppState?.character?.isSafeArea;
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

  async function openBox(box) {
    if (!isSafeArea()) {
      const msg = $('#msg');
      if (msg) {
        msg.textContent = 'You must be in a safe area to open loot boxes.';
        msg.classList.remove('muted');
      }
      return;
    }
    const items = window.App.Logic.Loot.generate(
      box.rarity,
      box.seed || box.id
    );
    const payload = items.map((it) => ({
      loot_box_id: box.id,
      item_name: it.item_name,
      qty: it.qty,
      rarity: it.rarity,
    }));
    const { error: insErr } = await supa.from('loot_box_items').insert(payload);
    if (insErr) {
      console.error(insErr);
      return;
    }
    await supa
      .from('loot_boxes')
      .update({ status: 'opened', opened_at: new Date().toISOString() })
      .eq('id', box.id);

    items.forEach((it) => addToInventory(it.item_name, it.qty));
    render(); // refresh lists
  }

  /* ---------- UI helpers ---------- */
  function rarityPill(rarity) {
    const span = el('span', `pill rarity-${rarity}`);
    span.textContent = rarity;
    return span;
  }

  function ensureContainers() {
    const card = $('#achievementsCard');
    if (!card) return {};
    // Controls row (filter dropdown)
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
    // Unified activity list
    let feed = card.querySelector('#achActivity');
    if (!feed) {
      feed = el('div');
      feed.id = 'achActivity';
      feed.className = 'list';
      feed.style.marginTop = '10px';
      card.appendChild(feed);
    }
    // Loot panel for actions (kept)
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

    // Build a combined activity array
    const activity = [];

    // Achievements (granted events)
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

    // Loot boxes (grant + open events)
    boxes.forEach((b) => {
      // grant
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
      // opened (if applicable)
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

    // Filter
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
          return true; // all
      }
    });

    // Sort newest first
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

    // Unopened
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
        btn.disabled = !isSafeArea();
        btn.addEventListener('click', () => {
          btn.disabled = true;
          openBox(b);
        });
        right.append(btn);
        row.append(left, right);
        panelEl.appendChild(row);
      });
    }

    // Opened history
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

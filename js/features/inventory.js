// /js/features/inventory.js
(function (global) {
  const App = (global.App = global.App || { Features: {}, Logic: {} });

  function escapeHtml(s) {
    return String(s || '').replace(
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

  async function wireMoneyWidget() {
    const sb = window.sb;
    const chId = window.AppState?.character?.id;
    if (!sb || !chId) return;

    // find or create the Credits item (non-equip)
    async function ensureCredits() {
      const { data } = await sb
        .from('items')
        .select('id,name')
        .eq('name', 'Credits')
        .is('slot', null)
        .maybeSingle();
      if (data?.id) return data;

      const { data: ins } = await sb
        .from('items')
        .insert({
          name: 'Credits',
          slot: null,
          notes: 'Universal currency.',
          rarity: 'common',
          drop_eligible: false,
        })
        .select('id,name')
        .single();
      return ins;
    }

    const credits = await ensureCredits();
    if (!credits?.id) return;

    async function readBalance() {
      const { data } = await sb
        .from('character_items')
        .select('qty')
        .eq('character_id', chId)
        .eq('item_id', credits.id)
        .maybeSingle();
      return Math.max(0, Number(data?.qty || 0));
    }

    async function changeBalance(delta) {
      await App.Logic.inventory.addById(sb, chId, credits.id, delta);
      document.getElementById('moneyAmount').textContent = String(
        await readBalance()
      );
    }

    // paint + wire
    document.getElementById('moneyCard').style.display = '';
    document.getElementById('moneyAmount').textContent = String(
      await readBalance()
    );
    document
      .getElementById('btnMoneyMinus10')
      ?.addEventListener('click', () => changeBalance(-10));
    document
      .getElementById('btnMoneyMinus1')
      ?.addEventListener('click', () => changeBalance(-1));
    document
      .getElementById('btnMoneyPlus1')
      ?.addEventListener('click', () => changeBalance(+1));
    document
      .getElementById('btnMoneyPlus10')
      ?.addEventListener('click', () => changeBalance(+10));
  }

  // Loads and renders inventory with right-hand description from items.notes
  async function load(characterId, handlers = {}) {
    const client = global.sb;
    if (!client) return [];

    const { data, error } = await client
      .from('character_items')
      .select(
        // add notes to the joined item columns
        'id,item_id,qty,item:items(id,name,slot,damage,armor_value,ability_id,rarity,notes)'
      )
      .eq('character_id', characterId)
      .order('id', { ascending: true });

    if (error) {
      console.warn('[inventory] query error', error);
      return [];
    }

    const rows = data || [];
    const root = document.querySelector('#inventoryAllList');
    const empty = document.querySelector('#inventoryEmpty');
    if (!root) return rows;

    if (!rows.length) {
      root.innerHTML = '';
      if (empty) empty.style.display = '';
      return rows;
    }
    if (empty) empty.style.display = 'none';

    // --- helpers ---
    const ARMOR_SLOTS = new Set(['head', 'chest', 'legs', 'hands', 'feet']);
    const isWeapon = (r) =>
      r.item?.slot === 'weapon' || r.item?.slot === 'offhand';
    const isArmor = (r) => ARMOR_SLOTS.has(r.item?.slot);
    const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

    // New two-column row
    function renderRow(r) {
      const it = r.item || {};
      const equippable = !!it.slot;
      const name = escapeHtml(it.name || '(Unknown)');
      const qty = Math.max(0, Number(r.qty || 0));

      const metaParts = [];
      if (it.rarity) metaParts.push(`[${escapeHtml(it.rarity)}]`);
      if (it.damage) metaParts.push(`DMG ${escapeHtml(it.damage)}`);
      if (Number(it.armor_value || 0) > 0)
        metaParts.push(`ARM ${Number(it.armor_value)}`);
      if (it.slot) metaParts.push(cap(it.slot));
      const meta = metaParts.length ? ' | ' + metaParts.join(' | ') : '';

      const desc = it.notes ? escapeHtml(it.notes) : 'No description.';

      const qtyCtrls = `
        <div class="inv-actions">
          <button class="btn-tiny" data-action="dec" data-item="${
            r.item_id
          }">−1</button>
          <span class="mono" style="min-width:2ch; text-align:center; display:inline-block">${qty}</span>
          <button class="btn-tiny" data-action="inc" data-item="${
            r.item_id
          }">+1</button>
          ${
            equippable
              ? `<button class="btn-tiny btn-accent" data-action="equip" data-line="${r.id}">Equip</button>`
              : ``
          }
        </div>
      `;

      return `
        <div class="inv-row" data-line="${r.id}">
          <div class="inv-main">
            <span class="inv-name" title="${desc}">${name}</span>
            <span class="inv-meta">${meta}</span>
            <span class="spacer"></span>
            ${qtyCtrls}
          </div>
          <div class="inv-desc">${desc}</div>
        </div>
      `;
    }

    const weapons = rows.filter(isWeapon);
    const armor = rows.filter(isArmor);
    const other = rows.filter((r) => !isWeapon(r) && !isArmor(r));

    const section = (title, list) =>
      list.length
        ? `<h4 class="muted" style="margin:8px 0 4px">${title}</h4>` +
          list.map(renderRow).join('')
        : '';

    root.innerHTML =
      section('Weapons', weapons) +
      section('Armor', armor) +
      section('Other', other);

    // actions
    root.querySelectorAll('button[data-action="equip"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const lineId = btn.getAttribute('data-line');
        btn.disabled = true;
        try {
          await handlers.onEquip?.(lineId);
        } finally {
          btn.disabled = false;
        }
      });
    });

    root.querySelectorAll('button[data-action="inc"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const itemId = btn.getAttribute('data-item');
        await handlers.onAdjustQty?.(itemId, +1);
      });
    });

    root.querySelectorAll('button[data-action="dec"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const itemId = btn.getAttribute('data-item');
        await handlers.onAdjustQty?.(itemId, -1);
      });
    });

    return rows;
  }
  App.Features.inventory = { load, wireMoneyWidget };
})(window);

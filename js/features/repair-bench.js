// /js/features/repair-bench.js
(function (global) {
  const App = (global.App = global.App || { Features: {}, Logic: {} });
  const sb = global.sb || global.supabaseClient;
  const $ = (id) => document.getElementById(id);

  let _cap = Infinity; // how many pieces we may repair this visit
  let _equippedOnly = true; // whether we limit targets to equipped broken pieces
  let _rows = []; // combined targets + donors for this character
  let _plan = []; // computed plan (targetId, donorId, t, d)
  let _skipped = []; // skipped with reasons
  let _charId = null;

  // ---- rarity helpers (string -> comparable number) ----
  const RARITY_RANK = {
    common: 1,
    uncommon: 2,
    rare: 3,
    epic: 4,
    legendary: 5,
  };
  function rarityRank(s) {
    return RARITY_RANK[String(s || '').toLowerCase()] ?? 0;
  }
  function rank(row) {
    return rarityRank(row.item?.rarity);
  }
  function rarity(row) {
    return String(row.item?.rarity || '').toLowerCase();
  }

  // ---- item/row helpers ----
  function hasAbility(row) {
    return !!row.item?.ability_id;
  }
  function isBroken(row) {
    const max = Number(row.durability_max ?? 0);
    const cur = Number(row.durability_current ?? 0);
    return row.equipped && max > 0 && cur < max;
  }
  function isArmorRow(row) {
    // treat any item with armor_value > 0 as armor
    return Number(row.item?.armor_value ?? 0) > 0;
  }
  function label(row) {
    const ab = hasAbility(row) ? '★' : '·';
    const rr = rarity(row) || 'unknown';
    const max = Number(row.durability_max ?? 0);
    const cur = Number(row.durability_current ?? 0);
    const dur = max ? ` • ${cur}/${max}` : '';
    const eq = row.equipped ? ' (equipped)' : '';
    return `${row.item?.name ?? 'Unknown'} • ${rr} • AV${
      row.item?.armor_value ?? 0
    } ${ab}${dur}${eq}`;
  }

  // ---- data fetchers, aligned to your schema ----
  // Equipped targets come from character_equipment (with durability)
  async function fetchEquippedArmor(characterId) {
    const { data, error } = await sb
      .from('character_equipment')
      .select(
        `
        id, slot, item_id, slots_remaining,
        item:items(id, name, slot, armor_value, ability_id, rarity)
      `
      )
      .eq('character_id', characterId);

    if (error) {
      console.warn('[repair] equipped fetch error', error);
      return [];
    }

    return (data || [])
      .filter((r) => r.item && Number(r.item.armor_value || 0) > 0)
      .map((r) => ({
        id: r.id,
        equipped: true,
        slot: r.slot,
        qty: 1,
        durability_current: Number(r.slots_remaining ?? 0),
        durability_max: Number(r.item?.armor_value ?? 0),
        item: {
          id: r.item?.id,
          name: r.item?.name,
          slot: r.item?.slot,
          armor_value: Number(r.item?.armor_value ?? 0),
          ability_id: r.item?.ability_id ?? null,
          rarity: r.item?.rarity ?? null,
        },
      }));
  }

  // Donor pool: inventory only (everything in character_items is unequipped)
  async function fetchDonorArmor(characterId) {
    const { data, error } = await sb
      .from('character_items')
      .select(
        `
      id, qty, item_id,
      item:items(id, name, slot, armor_value, ability_id, rarity)
    `
      )
      .eq('character_id', characterId);

    if (error) {
      console.warn('[repair] donors fetch error', error);
      return [];
    }

    return (data || [])
      .filter((r) => r.item && Number(r.item.armor_value || 0) > 0) // armor only
      .map((r) => ({
        id: r.id,
        equipped: false, // inventory is unequipped by definition
        slot: r.item?.slot || null,
        qty: Number(r.qty ?? 1),
        durability_current: null,
        durability_max: null,
        item: {
          id: r.item?.id,
          name: r.item?.name,
          slot: r.item?.slot || null,
          armor_value: Number(r.item?.armor_value ?? 0),
          ability_id: r.item?.ability_id ?? null,
          rarity: r.item?.rarity ?? null,
        },
      }));
  }

  // ---- planner: donors without ability -> same rarity -> lowest higher rarity ----
  function planRepairs(rows, opts = {}) {
    const allowUpTier = !!opts.allowUpTier; // allow using higher rarity donors
    const allowLegendary = !!opts.allowLegendary; // allow consuming legendary donors
    const cap = opts.cap ?? Infinity;
    const eqOnly = !!opts.equippedOnly;

    const brokenTargets = rows.filter(
      (r) => isArmorRow(r) && isBroken(r) && (!eqOnly || r.equipped)
    );
    const donorPool = rows
      .filter((r) => isArmorRow(r) && !r.equipped && (r.qty ?? 1) > 0)
      .map((r) => ({ ...r })); // shallow copy to mutate qty

    // donor sorting: prefer no ability, then lowest rarity rank, then lowest armor_value
    donorPool.sort((a, b) => {
      const abil = (hasAbility(a) ? 1 : 0) - (hasAbility(b) ? 1 : 0); // 0 (no ability) first
      if (abil !== 0) return abil;
      const rr = rank(a) - rank(b); // lower rarity first
      if (rr !== 0) return rr;
      return (a.item?.armor_value ?? 0) - (b.item?.armor_value ?? 0); // lower AV first
    });

    const plan = [];
    const skipped = [];

    function takeOne(d) {
      if ((d.qty ?? 1) > 1) d.qty -= 1;
      else donorPool.splice(donorPool.indexOf(d), 1);
    }

    for (const t of brokenTargets) {
      if (plan.length >= cap) {
        skipped.push({ target: t, reason: 'cap' });
        continue;
      }

      const tRank = rank(t);
      let candidate = null;

      // same rarity, no ability
      candidate = donorPool.find((d) => rank(d) === tRank && !hasAbility(d));

      // up rarity, no ability (if allowed)
      if (!candidate && allowUpTier) {
        candidate = donorPool.find((d) => rank(d) > tRank && !hasAbility(d));
      }

      // fallback: same rarity (regardless of ability), then up rarity (regardless)
      if (!candidate) candidate = donorPool.find((d) => rank(d) === tRank);
      if (!candidate && allowUpTier)
        candidate = donorPool.find((d) => rank(d) > tRank);

      if (candidate) {
        const isLegendary = rank(candidate) >= RARITY_RANK.legendary;
        if (isLegendary && !allowLegendary) {
          skipped.push({ target: t, reason: 'legendary-locked' });
          continue;
        }
        takeOne(candidate);
        plan.push({ targetId: t.id, donorId: candidate.id, t, d: candidate });
      } else {
        skipped.push({ target: t, reason: 'no-eligible-donor' });
      }
    }

    return { plan, skipped };
  }

  // ---- UI renderers ----
  function renderCapsule(cap) {
    const el = $('repairCapsule');
    if (!el) return;
    el.textContent =
      cap === Infinity
        ? 'Long rest: Auto-repair all equipped broken armor.'
        : `Short rest: You may repair up to ${cap} piece${cap > 1 ? 's' : ''}.`;
  }

  function renderAutoPreview() {
    const root = $('repairAutoPreview');
    if (!root) return;
    root.innerHTML = '';

    if (!_plan.length && !_skipped.length) {
      const p = document.createElement('div');
      p.className = 'muted';
      p.textContent = 'Click “Plan” to generate an auto-repair plan.';
      root.appendChild(p);
      return;
    }

    const repaired = document.createElement('div');
    repaired.innerHTML = `<strong>Repairs: ${_plan.length}</strong>`;
    root.appendChild(repaired);

    for (const p of _plan) {
      const row = document.createElement('div');
      row.className = 'row';
      row.style.justifyContent = 'space-between';
      row.innerHTML = `
        <span>${p.t.item.name} ← <em>${p.d.item.name}</em></span>
        <span>${rarity(p.t) || 'unknown'} / ${rarity(p.d) || 'unknown'} ${
        hasAbility(p.d) ? '★' : '·'
      }</span>
      `;
      root.appendChild(row);
    }

    if (_skipped.length) {
      const sk = document.createElement('div');
      sk.style.marginTop = '8px';
      sk.innerHTML = `<strong>Skipped: ${_skipped.length}</strong>`;
      root.appendChild(sk);
      for (const s of _skipped) {
        const r = document.createElement('div');
        r.className = 'row';
        r.style.justifyContent = 'space-between';
        r.innerHTML = `<span>${s.target.item.name}</span><span class="muted">${s.reason}</span>`;
        root.appendChild(r);
      }
    }
  }

  function renderManualList() {
    const root = $('repairManualList');
    if (!root) return;
    root.innerHTML = '';

    const targets = _rows.filter(
      (r) => isBroken(r) && (!_equippedOnly || r.equipped)
    );
    const donors = _rows.filter((r) => isArmorRow(r) && !r.equipped);

    if (!targets.length) {
      const p = document.createElement('div');
      p.className = 'muted';
      p.textContent = 'No broken armor found.';
      root.appendChild(p);
      return;
    }

    targets.forEach((t, idx) => {
      const wrap = document.createElement('div');
      wrap.className = 'row';
      wrap.style.justifyContent = 'space-between';
      wrap.style.gap = '8px';

      const left = document.createElement('div');
      left.textContent = label(t);

      const sel = document.createElement('select');

      // donors sorted by our priority (no ability -> lower rarity -> lower AV)
      const sorted = donors
        .slice()
        .sort((a, b) => {
          const abil = (hasAbility(a) ? 1 : 0) - (hasAbility(b) ? 1 : 0);
          if (abil !== 0) return abil;
          const rr = rank(a) - rank(b);
          if (rr !== 0) return rr;
          return (a.item?.armor_value ?? 0) - (b.item?.armor_value ?? 0);
        })
        .filter((d) => rank(d) >= rank(t));

      sorted.forEach((d) => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = label(d);
        sel.appendChild(opt);
      });

      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = 'Fix';
      btn.onclick = async () => {
        if (_cap !== Infinity && _cap <= 0) {
          global.setText?.('msg', 'Repair cap reached.');
          return;
        }
        await confirmBatch([{ targetId: t.id, donorId: sel.value }]);
        _cap = _cap === Infinity ? Infinity : Math.max(0, _cap - 1);
        await reload(); // refresh rows and UI
      };

      wrap.appendChild(left);
      wrap.appendChild(sel);
      wrap.appendChild(btn);
      root.appendChild(wrap);

      if (idx >= 50) return; // safety against huge lists
    });
  }

  // ---- RPC call ----
  async function confirmBatch(plan) {
    if (!plan.length) return;
    const target_ids = plan.map((p) => p.targetId);
    const donor_ids = plan.map((p) => p.donorId);
    const { data, error } = await sb.rpc('rpc_repair_armor_batch', {
      p_char: _charId,
      p_target_ids: target_ids,
      p_donor_ids: donor_ids,
    });
    if (error) {
      console.warn('[repair] batch rpc error', error);
      global.setText?.('msg', 'Repair failed.');
      return;
    }
    global.setText?.(
      'msg',
      `Repaired ${data?.repaired ?? plan.length}, Skipped ${
        data?.skipped ?? 0
      }.`
    );
    // notify other components
    global.dispatchEvent(new CustomEvent('inventory:refresh'));
    global.dispatchEvent(new CustomEvent('equipment:refresh'));
  }

  // ---- open/close/wire/reload ----
  async function reload() {
    const eq = await fetchEquippedArmor(_charId);
    const donors = await fetchDonorArmor(_charId);
    _rows = [...eq, ...donors];
    renderCapsule(_cap);
    renderAutoPreview();
    renderManualList();
  }

  async function open(opts = {}) {
    const ch = global.AppState?.character;
    if (!ch) return;
    _charId = ch.id;
    _cap = opts.cap ?? Infinity;
    _equippedOnly = opts.equippedOnly !== false; // default true

    const allowUpTier = !!opts.allowUpTier;
    const allowLegendary = !!opts.allowLegendary;

    const chkUp = $('repairAllowUpTier');
    if (chkUp) chkUp.checked = allowUpTier;
    const chkLg = $('repairAllowLegendary');
    if (chkLg) chkLg.checked = allowLegendary;

    const modal = $('repairModal');
    if (modal) modal.classList.remove('hidden');
    await reload();
  }

  function close() {
    const modal = $('repairModal');
    if (modal) modal.classList.add('hidden');
    _plan = [];
    _skipped = [];
  }

  function wire() {
    $('repairClose')?.addEventListener('click', close);

    $('repairTabAuto')?.addEventListener('click', () => {
      $('repairAutoPane')?.classList.remove('hidden');
      $('repairManualPane')?.classList.add('hidden');
    });
    $('repairTabManual')?.addEventListener('click', () => {
      $('repairAutoPane')?.classList.add('hidden');
      $('repairManualPane')?.classList.remove('hidden');
    });

    $('repairAutoPlan')?.addEventListener('click', () => {
      const opts = {
        allowUpTier: !!$('repairAllowUpTier')?.checked,
        allowLegendary: !!$('repairAllowLegendary')?.checked,
        cap: _cap,
        equippedOnly: _equippedOnly,
      };
      const { plan, skipped } = planRepairs(_rows, opts);
      _plan = plan;
      _skipped = skipped;
      renderAutoPreview();
    });

    $('repairAutoConfirm')?.addEventListener('click', async () => {
      const toSend = _cap === Infinity ? _plan : _plan.slice(0, _cap);
      await confirmBatch(toSend);
      if (_cap !== Infinity) _cap = Math.max(0, _cap - toSend.length);
      await reload();
    });

    // esc to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
  }

  App.Features.repairBench = { open, close, wire, planRepairs };
})(window);

// /js/features/repair-bench.js
(function (global) {
  const App = (global.App = global.App || { Features: {}, Logic: {} });
  const sb = global.sb || global.supabaseClient;
  const $ = (id) => document.getElementById(id);

  let _cap = Infinity; // how many pieces we may repair this visit
  let _equippedOnly = true; // whether we limit targets to equipped broken pieces
  let _rows = []; // armor rows cache for this session
  let _plan = []; // computed plan (targetId, donorId)
  let _skipped = []; // skipped with reasons
  let _charId = null;

  // --- helpers ---
  function hasAbility(row) {
    // items.ability_id present? tweak if you store differently
    return !!row.item?.ability_id;
  }
  function isBroken(row) {
    return (row.durability_current ?? 0) < (row.durability_max ?? 0);
  }
  function isArmor(row) {
    return !!row.item?.slot;
  }
  function tier(row) {
    return row.item?.tier ?? 0;
  }
  function label(row) {
    const ab = hasAbility(row) ? '★' : '·';
    return `${row.item?.name} [${row.item?.slot}] T${tier(row)} ${ab} • ${
      row.durability_current
    }/${row.durability_max} ${row.equipped ? '(equipped)' : ''}`;
  }

  async function fetchArmorRows(characterId) {
    const { data, error } = await sb
      .from('character_items')
      .select(
        `
        id, qty, equipped, durability_current, durability_max,
        item:items(id,name,slot,tier,ability_id)
      `
      )
      .eq('character_id', characterId)
      .not('item.slot', 'is', null)
      .order('id', { ascending: true });
    if (error) {
      console.warn('[repair] fetch error', error);
      return [];
    }
    return data || [];
  }

  // Auto planner with your priorities:
  // 1) donors WITHOUT ability first
  // 2) same-tier before up-tier
  // 3) never consume equipped or legendary unless allowed
  function planRepairs(rows, opts = {}) {
    const allowUpTier = !!opts.allowUpTier;
    const allowLegendary = !!opts.allowLegendary;
    const cap = opts.cap ?? Infinity;
    const eqOnly = !!opts.equippedOnly;

    const brokenTargets = rows.filter(
      (r) => isArmor(r) && isBroken(r) && (!eqOnly || r.equipped)
    );
    const donorPool = rows
      .filter((r) => isArmor(r) && !r.equipped && (r.qty ?? 1) > 0)
      .map((r) => ({ ...r })); // copy to mutate qty locally

    // sort donors: no-ability first, then tier asc
    donorPool.sort((a, b) => {
      const abil = (hasAbility(a) ? 1 : 0) - (hasAbility(b) ? 1 : 0); // 0 before 1
      if (abil !== 0) return abil;
      return tier(a) - tier(b);
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
      const tTier = tier(t);

      // candidates by priority
      let candidate = donorPool.find(
        (d) => tier(d) === tTier && !hasAbility(d)
      );
      if (!candidate && allowUpTier)
        candidate = donorPool.find((d) => tier(d) > tTier && !hasAbility(d));

      if (!candidate) {
        // fallback: allow donors with abilities (if user allows by just checking allowUpTier/legendary; we still try to prefer same tier)
        candidate = donorPool.find((d) => tier(d) === tTier);
        if (!candidate && allowUpTier)
          candidate = donorPool.find((d) => tier(d) > tTier);
      }

      if (candidate) {
        const isLegendary = tier(candidate) >= 5; // adjust if your scale differs
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

  // --- UI renderers ---
  function renderCapsule(cap) {
    const el = $('repairCapsule');
    el.textContent =
      cap === Infinity
        ? 'Long rest: Auto-repair all equipped broken armor.'
        : `Short rest: You may repair up to ${cap} piece${cap > 1 ? 's' : ''}.`;
  }

  function renderAutoPreview() {
    const root = $('repairAutoPreview');
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
        <span>T${tier(p.t)} / T${tier(p.d)} ${
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
    root.innerHTML = '';

    const targets = _rows.filter(
      (r) => isBroken(r) && (!_equippedOnly || r.equipped)
    );
    const donors = _rows.filter((r) => isArmor(r) && !r.equipped);

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
      // donor choices: sort by our priority too
      const sorted = donors
        .slice()
        .sort((a, b) => {
          const abil = (hasAbility(a) ? 1 : 0) - (hasAbility(b) ? 1 : 0);
          if (abil !== 0) return abil;
          return tier(a) - tier(b);
        })
        .filter((d) => tier(d) >= tier(t));

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

  // --- rpc ---
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
    // let other views know
    global.dispatchEvent(new CustomEvent('inventory:refresh'));
    global.dispatchEvent(new CustomEvent('equipment:refresh'));
  }

  // --- open/close/wire/reload ---
  async function reload() {
    _rows = await fetchArmorRows(_charId);
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

    $('repairAllowUpTier').checked = !!opts.allowUpTier;
    $('repairAllowLegendary').checked = !!opts.allowLegendary;

    $('repairModal').classList.remove('hidden');
    await reload();
  }

  function close() {
    $('repairModal')?.classList.add('hidden');
    _plan = [];
    _skipped = [];
  }

  function wire() {
    $('repairClose')?.addEventListener('click', close);

    $('repairTabAuto')?.addEventListener('click', () => {
      $('repairAutoPane').classList.remove('hidden');
      $('repairManualPane').classList.add('hidden');
    });
    $('repairTabManual')?.addEventListener('click', () => {
      $('repairAutoPane').classList.add('hidden');
      $('repairManualPane').classList.remove('hidden');
    });

    $('repairAutoPlan')?.addEventListener('click', () => {
      const opts = {
        allowUpTier: $('repairAllowUpTier').checked,
        allowLegendary: $('repairAllowLegendary').checked,
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

// /js/dm.js
(function () {
  // Get the actual Supabase client instance (not the SDK namespace)
  const supa = window.supabaseClient || window.sb || window.supabase?.client;
  if (!supa || typeof supa.from !== 'function') {
    console.error(
      '[dm] Supabase client missing. Check script order and supabase-client.js exports.'
    );
    return;
  }

  const $ = (s) => document.querySelector(s);
  const setMsg = (t) => {
    const el = $('#dmMsg');
    if (el) el.textContent = t || '';
  };
  const setVwMsg = (t) => {
    const el = $('#dmVwMsg');
    if (el) el.textContent = t || '';
  };
  // Lives outside #dmApp so it stays visible while the panel is gated.
  const setStatus = (t) => {
    const el = $('#dmStatus');
    if (el) el.textContent = t || '';
  };

  const escapeHtml = (s) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      (m) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[m]
    );

  // Number(null) is 0, so null has to be rejected before the finite check.
  const isNum = (v) =>
    v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  const num = (n) => (isNum(n) ? Number(n).toLocaleString() : '—');
  const rankLabel = (n) => (isNum(n) ? `#${Number(n)}` : '—');
  const dash = (v) => (v === null || v === undefined || v === '' ? '—' : v);

  let _chars = [];
  let _user = null;
  let _selectedId = '';
  let _vwCurrent = null; // viewership row for the selected character

  const selectedId = () => _selectedId;
  const selectedChar = () => _chars.find((c) => c.id === _selectedId) || null;
  const selectedName = () => selectedChar()?.name || 'this character';

  async function withBusy(btn, label, fn) {
    const prev = btn?.textContent;
    if (btn) {
      btn.disabled = true;
      btn.textContent = label;
    }
    try {
      return await fn();
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = prev;
      }
    }
  }

  // ----------------------------
  // Tabs
  // ----------------------------
  function showTab(name) {
    document
      .querySelectorAll('.tab')
      .forEach((t) => t.classList.toggle('is-active', t.dataset.tab === name));
    document
      .querySelectorAll('.tabpane')
      .forEach((p) => p.classList.toggle('is-active', p.id === `pane-${name}`));
  }

  // ----------------------------
  // Roster (doubles as the character picker)
  // ----------------------------
  function renderRoster() {
    const root = $('#dmRoster');
    if (!root) return;

    const q = ($('#dmSearch')?.value || '').trim().toLowerCase();
    const list = q
      ? _chars.filter((c) => (c.name || '').toLowerCase().includes(q))
      : _chars;

    if (!list.length) {
      root.innerHTML = `<div class="muted" style="padding:8px">${
        _chars.length ? 'No matches.' : 'No characters found (check RLS).'
      }</div>`;
      return;
    }

    root.innerHTML = list
      .map((c) => {
        const ratio = c.hp_total ? Number(c.hp_current) / Number(c.hp_total) : 1;
        const hp =
          isNum(c.hp_current) && isNum(c.hp_total)
            ? `<span class="${ratio <= 0.34 ? 'low' : ''}">${c.hp_current}/${
                c.hp_total
              } HP</span>`
            : '';
        return `<button type="button" class="roster-item ${
          c.id === _selectedId ? 'is-active' : ''
        }" data-id="${escapeHtml(c.id)}">
          <div class="roster-name">${escapeHtml(c.name || c.id)}</div>
          <div class="roster-meta">Char ${dash(c.level)} · Class ${dash(c.class_level ?? 1)}${hp ? ' · ' + hp : ''}</div>
        </button>`;
      })
      .join('');
  }

  function renderDetailHead() {
    const c = selectedChar();
    $('#dmSelName').textContent = c?.name || 'No character selected';
    $('#dmSelSub').textContent = c
      ? `Char Lv ${dash(c.level)} · Class Lv ${dash(c.class_level ?? 1)} · ${dash(c.hp_current)}/${dash(
          c.hp_total
        )} HP`
      : 'Pick someone from the roster.';
    const target = $('#dmGrantTarget');
    if (target) target.textContent = c?.name || '—';
  }

  async function selectCharacter(id) {
    _selectedId = id;
    renderRoster();
    renderDetailHead();
    await onCharChange();
  }

  async function loadChars() {
    try {
      const { data, error } = await supa
        .from('characters')
        .select('id,name,level,class_level,hp_current,hp_total,is_active')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;

      _chars = data || [];
      if (!_chars.some((c) => c.id === _selectedId)) {
        _selectedId = _chars[0]?.id || '';
      }
      renderRoster();
      renderDetailHead();
      if (_selectedId) await onCharChange();
      else await loadBoard();
    } catch (e) {
      console.error('[dm] loadChars', e);
      const root = $('#dmRoster');
      if (root)
        root.innerHTML = `<div class="muted" style="padding:8px">Error: ${escapeHtml(
          e?.message || e
        )}</div>`;
    }
  }

  async function onCharChange() {
    await Promise.all([loadOverview(), loadViewership(), loadEditSheet()]);
    await loadBoard();
  }

  // ----------------------------
  // Character overview
  // ----------------------------
  function kv(label, value, extraClass) {
    return `<div class="kv"><span class="kv-label">${escapeHtml(
      label
    )}</span><span class="kv-value ${extraClass || ''}">${escapeHtml(
      value
    )}</span></div>`;
  }

  async function loadOverview() {
    const chId = selectedId();
    const root = $('#dmOverview');
    if (!root) return;
    if (!chId) {
      root.textContent = 'Select a character.';
      return;
    }
    root.textContent = 'Loading…';

    const [ch, stats, equip, ach, boxes, items, xp] = await Promise.all([
      supa.from('characters').select('*').eq('id', chId).maybeSingle(),
      supa
        .from('character_stats')
        .select('*')
        .eq('character_id', chId)
        .maybeSingle(),
      supa
        .from('character_equipment')
        .select(
          'slot, slots_remaining, exo_left, item:items(name, armor_value, damage)'
        )
        .eq('character_id', chId),
      supa
        .from('achievements')
        .select('*', { count: 'exact', head: true })
        .eq('character_id', chId),
      supa
        .from('loot_boxes')
        .select('*', { count: 'exact', head: true })
        .eq('character_id', chId)
        .eq('status', 'unopened'),
      supa.from('character_items').select('qty').eq('character_id', chId),
      supa
        .from('character_experiences')
        .select('xp_name, xp_bonus')
        .eq('character_id', chId),
    ]);

    if (ch.error || !ch.data) {
      root.textContent =
        'Could not load character: ' + (ch.error?.message || 'not found');
      return;
    }

    const c = ch.data;
    const s = stats.data || {};
    const hpRatio = c.hp_total ? Number(c.hp_current) / Number(c.hp_total) : 1;

    const identity = [
      kv('Race', dash(c.race)),
      kv('Class', dash(c.class)),
      kv('Character Level', dash(c.level)),
      kv('Class Level', dash(c.class_level ?? 1)),
      kv('Status', c.is_active === false ? 'Inactive' : 'Active'),
      kv(
        'HP',
        `${dash(c.hp_current)} / ${dash(c.hp_total)}`,
        hpRatio <= 0.34 ? 'low' : ''
      ),
    ].join('');

    const vitals = [
      kv('Evasion', dash(c.evasion)),
      kv('Hope', dash(c.hope_points)),
      kv('Stress', dash(c.stress_points)),
      kv('Armor HP', dash(c.armor_hp)),
      kv('Stripping', dash(c.stripping_level)),
      kv('Thresholds', `${dash(c.dmg_t1)} / ${dash(c.dmg_t2)}`),
      kv(
        'Exoskin',
        `${dash(c.exoskin_slots_remaining)} / ${dash(c.exoskin_slots_max)}`
      ),
    ].join('');

    const abilities = [
      kv('Strength', dash(s.stat_strength)),
      kv('Agility', dash(s.stat_agility)),
      kv('Finesse', dash(s.stat_finesse)),
      kv('Instinct', dash(s.stat_instinct)),
      kv('Presence', dash(s.stat_presence)),
      kv('Knowledge', dash(s.stat_knowledge)),
    ].join('');

    const totalQty = (items.data || []).reduce(
      (n, r) => n + (Number(r.qty) || 0),
      0
    );
    const counts = [
      kv('Achievements', ach.count ?? 0),
      kv('Unopened boxes', boxes.count ?? 0),
      kv('Inventory items', totalQty),
      kv('Experiences', (xp.data || []).length),
    ].join('');

    const eqRows = (equip.data || [])
      .slice()
      .sort((a, b) => String(a.slot).localeCompare(String(b.slot)))
      .map(
        (r) => `<tr>
          <td>${escapeHtml(r.slot)}</td>
          <td>${escapeHtml(r.item?.name || '—')}</td>
          <td class="num">${dash(r.item?.damage)}</td>
          <td class="num">${dash(r.slots_remaining)}${
            r.item?.armor_value ? ` / ${escapeHtml(r.item.armor_value)}` : ''
          }</td>
          <td class="num">${dash(r.exo_left)}</td>
        </tr>`
      )
      .join('');

    const equipTable = eqRows
      ? `<table class="dm-table">
           <thead><tr>
             <th>Slot</th><th>Item</th><th class="num">Dmg</th>
             <th class="num">Armor left</th><th class="num">Exo</th>
           </tr></thead>
           <tbody>${eqRows}</tbody>
         </table>`
      : '<div class="muted">Nothing equipped.</div>';

    const xpList = (xp.data || []).length
      ? `<div class="muted">${(xp.data || [])
          .map((x) => `${escapeHtml(x.xp_name)} +${Number(x.xp_bonus ?? 0)}`)
          .join(' · ')}</div>`
      : '<div class="muted">No experiences.</div>';

    root.innerHTML = `
      <div class="section-label">Identity</div>
      <div class="kv-grid">${identity}</div>
      <div class="section-label">Vitals</div>
      <div class="kv-grid">${vitals}</div>
      <div class="section-label">Abilities</div>
      <div class="kv-grid">${abilities}</div>
      <div class="section-label">Totals</div>
      <div class="kv-grid">${counts}</div>
      <div class="section-label">Equipped</div>
      ${equipTable}
      <div class="section-label">Experiences</div>
      ${xpList}
      ${
        c.notes
          ? `<div class="section-label">Notes</div><div class="muted">${escapeHtml(
              c.notes
            )}</div>`
          : ''
      }
      <div class="action-group admin" style="margin-top:16px">
        <div class="action-group-label">Character status</div>
        <div class="muted" style="margin-bottom:8px">
          Inactive characters are hidden from all lists and cannot log in.
        </div>
        <div class="btn-row">
          <button id="btnDeactivate" type="button">Deactivate character</button>
        </div>
      </div>
    `;
  }

  // ----------------------------
  // Edit sheet
  // ----------------------------
  const setEditMsg = (t) => {
    const el = $('#dmEditMsg');
    if (el) el.textContent = t || '';
  };

  function setInput(id, v) {
    const el = $(id);
    if (!el) return;
    if (el.type === 'number') {
      el.value =
        v === null || v === undefined || v === '' ? '' : String(v);
    } else {
      el.value = v ?? '';
    }
  }

  function readNum(id) {
    const raw = $(id)?.value;
    if (raw === '' || raw === null || raw === undefined) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function readText(id) {
    return ($(id)?.value ?? '').trim();
  }

  async function loadEditSheet() {
    const chId = selectedId();
    const form = $('#dmEditForm');
    if (!form) return;

    if (!chId) {
      setEditMsg('Select a character.');
      form.querySelectorAll('input, textarea').forEach((el) => {
        el.value = '';
        el.disabled = true;
      });
      return;
    }

    form.querySelectorAll('input, textarea').forEach((el) => {
      el.disabled = false;
    });
    setEditMsg('Loading…');

    const [ch, stats] = await Promise.all([
      supa.from('characters').select('*').eq('id', chId).maybeSingle(),
      supa
        .from('character_stats')
        .select('*')
        .eq('character_id', chId)
        .maybeSingle(),
    ]);

    if (ch.error || !ch.data) {
      setEditMsg('Could not load: ' + (ch.error?.message || 'not found'));
      return;
    }

    const c = ch.data;
    const s = stats.data || {};

    setInput('#dmEdName', c.name);
    setInput('#dmEdRace', c.race);
    setInput('#dmEdClass', c.class);
    setInput('#dmEdLevel', c.level);
    setInput('#dmEdClassLevel', c.class_level ?? 1);
    setInput('#dmEdHpCur', c.hp_current);
    setInput('#dmEdHpTot', c.hp_total);
    setInput('#dmEdEvasion', c.evasion);
    setInput('#dmEdHope', c.hope_points);
    setInput('#dmEdStress', c.stress_points);
    setInput('#dmEdArmorHp', c.armor_hp);
    setInput('#dmEdStripping', c.stripping_level);
    setInput('#dmEdExoMax', c.exoskin_slots_max);
    setInput('#dmEdExoRem', c.exoskin_slots_remaining);
    setInput('#dmEdDmgMinor', c.dmg_minor);
    setInput('#dmEdDmgMajor', c.dmg_major);
    setInput('#dmEdDmgSevere', c.dmg_severe);
    setInput('#dmEdDmgT1', c.dmg_t1);
    setInput('#dmEdDmgT2', c.dmg_t2);
    setInput('#dmEdStr', s.stat_strength);
    setInput('#dmEdAgi', s.stat_agility);
    setInput('#dmEdFin', s.stat_finesse);
    setInput('#dmEdIns', s.stat_instinct);
    setInput('#dmEdPre', s.stat_presence);
    setInput('#dmEdKno', s.stat_knowledge);
    setInput('#dmEdNotes', c.notes);

    setEditMsg('');
  }

  async function saveEditSheet(e) {
    e?.preventDefault?.();
    const chId = selectedId();
    if (!chId) {
      setEditMsg('Select a character first.');
      return;
    }

    const btn = $('#btnEdSave');
    await withBusy(btn, 'Saving…', async () => {
      const charPatch = {
        name: readText('#dmEdName') || null,
        race: readText('#dmEdRace') || null,
        class: readText('#dmEdClass') || null,
        level: readNum('#dmEdLevel'),
        class_level: readNum('#dmEdClassLevel'),
        hp_current: readNum('#dmEdHpCur'),
        hp_total: readNum('#dmEdHpTot'),
        evasion: readNum('#dmEdEvasion'),
        hope_points: readNum('#dmEdHope'),
        stress_points: readNum('#dmEdStress'),
        armor_hp: readNum('#dmEdArmorHp'),
        stripping_level: readNum('#dmEdStripping'),
        exoskin_slots_max: readNum('#dmEdExoMax'),
        exoskin_slots_remaining: readNum('#dmEdExoRem'),
        dmg_minor: readNum('#dmEdDmgMinor'),
        dmg_major: readNum('#dmEdDmgMajor'),
        dmg_severe: readNum('#dmEdDmgSevere'),
        dmg_t1: readNum('#dmEdDmgT1'),
        dmg_t2: readNum('#dmEdDmgT2'),
        notes: $('#dmEdNotes')?.value ?? '',
      };

      const { error: charErr } = await supa
        .from('characters')
        .update(charPatch)
        .eq('id', chId);
      if (charErr) {
        setEditMsg('Character save failed: ' + charErr.message);
        return;
      }

      const statsPatch = {
        stat_strength: readNum('#dmEdStr'),
        stat_agility: readNum('#dmEdAgi'),
        stat_finesse: readNum('#dmEdFin'),
        stat_instinct: readNum('#dmEdIns'),
        stat_presence: readNum('#dmEdPre'),
        stat_knowledge: readNum('#dmEdKno'),
      };

      const { data: statsRow } = await supa
        .from('character_stats')
        .select('character_id')
        .eq('character_id', chId)
        .maybeSingle();

      const statsErr = statsRow
        ? (
            await supa
              .from('character_stats')
              .update(statsPatch)
              .eq('character_id', chId)
          ).error
        : (
            await supa
              .from('character_stats')
              .insert({ character_id: chId, ...statsPatch })
          ).error;

      if (statsErr) {
        setEditMsg(
          'Character saved, but stats failed: ' +
            statsErr.message +
            ' (run sql/012_dm_character_stats.sql?)'
        );
        return;
      }

      const idx = _chars.findIndex((c) => c.id === chId);
      if (idx >= 0) {
        Object.assign(_chars[idx], {
          name: charPatch.name,
          level: charPatch.level,
          class_level: charPatch.class_level,
          hp_current: charPatch.hp_current,
          hp_total: charPatch.hp_total,
        });
      }

      renderRoster();
      renderDetailHead();
      await loadOverview();
      setEditMsg('Saved. Player should refresh their sheet to see changes.');
    });
  }

  async function deactivateCharacter() {
    const chId = selectedId();
    const name = selectedName();
    if (!chId) return;

    if (
      !confirm(
        `Deactivate ${name}? They will disappear from all lists and cannot log in.`
      )
    ) {
      return;
    }

    const btn = $('#btnDeactivate');
    await withBusy(btn, 'Deactivating…', async () => {
      const { error } = await supa
        .from('characters')
        .update({ is_active: false })
        .eq('id', chId);
      if (error) {
        alert('Could not deactivate: ' + error.message);
        return;
      }
      _selectedId = '';
      await loadChars();
      $('#dmOverview').textContent = `${name} deactivated.`;
      setMsg('');
      setVwMsg('');
    });
  }

  async function reactivateCharacter() {
    const name = ($('#dmReactivateName')?.value || '').trim();
    const msg = $('#dmReactivateMsg');
    const setReMsg = (t) => {
      if (msg) msg.textContent = t || '';
    };
    if (!name) {
      setReMsg('Enter a character name.');
      return;
    }

    const btn = $('#btnReactivate');
    await withBusy(btn, '…', async () => {
      const { data, error } = await supa
        .from('characters')
        .select('id,name')
        .eq('is_active', false)
        .ilike('name', name)
        .limit(2);

      if (error) {
        setReMsg('Error: ' + error.message);
        return;
      }
      if (!data?.length) {
        setReMsg(`No inactive character named "${name}".`);
        return;
      }
      if (data.length > 1) {
        setReMsg('Multiple inactive matches — use a more specific name.');
        return;
      }

      const { error: updErr } = await supa
        .from('characters')
        .update({ is_active: true })
        .eq('id', data[0].id);
      if (updErr) {
        setReMsg('Could not reactivate: ' + updErr.message);
        return;
      }

      $('#dmReactivateName').value = '';
      setReMsg(`Reactivated ${data[0].name}.`);
      await loadChars();
      await selectCharacter(data[0].id);
    });
  }

  // ----------------------------
  // Grants
  // ----------------------------
  function targetIds(all) {
    if (all) return _chars.map((c) => c.id);
    const id = selectedId();
    return id ? [id] : [];
  }

  async function grantAchievement(all) {
    const btn = all ? $('#btnGrantAchAll') : $('#btnGrantAch');
    const title = $('#dmTitle')?.value?.trim() || '';
    const description = $('#dmDesc')?.value?.trim() || '';
    const ids = targetIds(all);

    if (!ids.length) {
      setMsg(all ? 'No characters to grant to.' : 'Pick a character first.');
      return;
    }
    if (!title) {
      setMsg('Enter an achievement title.');
      return;
    }
    if (all && !confirm(`Grant "${title}" to all ${ids.length} active characters?`)) {
      return;
    }

    await withBusy(btn, 'Granting…', async () => {
      try {
        const awarded_at = new Date().toISOString();
        const rows = ids.map((character_id) => ({
          character_id,
          title,
          description: description || null,
          awarded_at, // remove if DB has DEFAULT now()
        }));

        const { error } = await supa.from('achievements').insert(rows);
        if (error) throw error;

        setMsg(
          `Achievement granted to ${
            all ? `all ${ids.length} active characters` : selectedName()
          }.`
        );
        const t = $('#dmTitle');
        if (t) t.value = '';
        const d = $('#dmDesc');
        if (d) d.value = '';
        await loadOverview();
      } catch (e) {
        console.error('[dm] grantAchievement', e);
        setMsg('Error: ' + (e?.message || e));
      }
    });
  }

  // rpc_give_and_seed_loot_box takes one character, so bulk fans out.
  async function grantBox(all) {
    const btn = all ? $('#btnGrantBoxAll') : $('#btnGrantBox');
    const rarity = $('#dmRarity')?.value;
    const ids = targetIds(all);

    if (!ids.length) {
      setMsg(all ? 'No characters to grant to.' : 'Pick a character first.');
      return;
    }
    if (!rarity) {
      setMsg('Pick a box rarity.');
      return;
    }
    if (
      all &&
      !confirm(`Grant a ${rarity} loot box to all ${ids.length} active characters?`)
    ) {
      return;
    }

    await withBusy(btn, 'Granting…', async () => {
      const results = await Promise.allSettled(
        ids.map((id) =>
          supa
            .rpc('rpc_give_and_seed_loot_box', {
              p_character_id: id,
              p_box_rarity: rarity,
            })
            .then(({ error }) => {
              if (error) throw error;
            })
        )
      );

      const failed = results.filter((r) => r.status === 'rejected');
      failed.forEach((f) => console.error('[dm] grantBox', f.reason));

      if (!failed.length) {
        setMsg(
          `Loot box (${rarity}) granted to ${
            all ? `all ${ids.length} active characters` : selectedName()
          }.`
        );
      } else {
        const ok = results.length - failed.length;
        setMsg(
          `Granted ${ok} of ${results.length}. ` +
            `First error: ${failed[0]?.reason?.message || failed[0]?.reason}`
        );
      }
      await loadOverview();
    });
  }

  // ----------------------------
  // Viewership
  // Inputs are deltas by default so you never have to guess the current value.
  // Blank means "leave this stat alone".
  // ----------------------------
  function readNum(sel) {
    const raw = ($(sel)?.value ?? '').trim();
    if (raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  const vwMode = () =>
    document.querySelector('input[name="dmVwMode"]:checked')?.value || 'add';

  function computeNext() {
    const mode = vwMode();
    const curV = _vwCurrent?.viewers ?? null;
    const curS = _vwCurrent?.subscribers ?? null;
    const curR = _vwCurrent?.rank ?? null;

    const inV = readNum('#dmVwViewers');
    const inS = readNum('#dmVwSubs');
    const inR = readNum('#dmVwRank');

    const apply = (cur, input) => {
      if (input === null) return cur; // untouched
      return mode === 'add' ? (cur ?? 0) + input : input;
    };

    return {
      viewers: apply(curV, inV),
      subscribers: apply(curS, inS),
      rank: inR === null ? curR : inR, // rank is a position, never additive
      touched: inV !== null || inS !== null || inR !== null,
      current: { viewers: curV, subscribers: curS, rank: curR },
    };
  }

  function renderPreview() {
    const el = $('#dmVwPreview');
    if (!el) return;

    const next = computeNext();
    if (!next.touched) {
      el.textContent = 'Preview: no changes.';
      return;
    }

    const line = (label, cur, val, fmt) => {
      if (cur === val) return `${label}: unchanged (${fmt(cur)})`;
      const down = Number.isFinite(cur) && Number.isFinite(val) && val < cur;
      const delta =
        Number.isFinite(cur) && Number.isFinite(val)
          ? ` (${val - cur >= 0 ? '+' : ''}${(val - cur).toLocaleString()})`
          : '';
      const text = `${label}: ${fmt(cur)} → ${fmt(val)}${delta}`;
      return down ? `<span class="down">↓ ${text}</span>` : text;
    };

    el.innerHTML = [
      line('Viewers', next.current.viewers, next.viewers, num),
      line('Subscribers', next.current.subscribers, next.subscribers, num),
      line('Rank', next.current.rank, next.rank, rankLabel),
    ].join('\n');
  }

  function renderCurrent() {
    $('#dmVwCurViewers').textContent = num(_vwCurrent?.viewers);
    $('#dmVwCurSubs').textContent = num(_vwCurrent?.subscribers);
    $('#dmVwCurRank').textContent = rankLabel(_vwCurrent?.rank);
  }

  async function loadViewership() {
    const character_id = selectedId();
    if (!character_id) return;

    const { data, error } = await supa
      .from('character_viewership')
      .select('viewers, subscribers, rank, updated_at')
      .eq('character_id', character_id)
      .maybeSingle();

    if (error) {
      console.error('[dm] loadViewership', error);
      setVwMsg('Error loading viewership: ' + error.message);
      _vwCurrent = null;
    } else {
      _vwCurrent = data || null;
      setVwMsg(
        data?.updated_at
          ? `Last updated ${new Date(data.updated_at).toLocaleString()}.`
          : 'No viewership saved for this character yet.'
      );
    }

    // Deltas from the previous character would be meaningless here.
    ['#dmVwViewers', '#dmVwSubs', '#dmVwRank'].forEach((s) => {
      const el = $(s);
      if (el) el.value = '';
    });
    renderCurrent();
    renderPreview();
  }

  async function saveViewership() {
    const character_id = selectedId();
    if (!character_id) {
      setVwMsg('Pick a character first.');
      return;
    }

    const next = computeNext();
    if (!next.touched) {
      setVwMsg('Nothing to save.');
      return;
    }
    if (
      (next.viewers !== null && next.viewers < 0) ||
      (next.subscribers !== null && next.subscribers < 0)
    ) {
      setVwMsg('That would make a value negative.');
      return;
    }

    const dropped = [];
    if (
      Number.isFinite(next.current.viewers) &&
      next.viewers < next.current.viewers
    )
      dropped.push('viewers');
    if (
      Number.isFinite(next.current.subscribers) &&
      next.subscribers < next.current.subscribers
    )
      dropped.push('subscribers');
    if (
      dropped.length &&
      !confirm(
        `This lowers ${dropped.join(' and ')} for ${selectedName()}. Continue?`
      )
    ) {
      return;
    }

    await withBusy($('#btnVwSave'), 'Saving…', async () => {
      const { error } = await supa.from('character_viewership').upsert(
        {
          character_id,
          viewers: next.viewers,
          subscribers: next.subscribers,
          rank: next.rank,
          updated_by: _user?.id ?? null,
        },
        { onConflict: 'character_id' }
      );

      if (error) {
        console.error('[dm] saveViewership', error);
        // Rank is unique across characters.
        if (error.code === '23505') {
          setVwMsg('That rank is already taken by another character.');
        } else {
          setVwMsg('Error saving: ' + error.message);
        }
        return;
      }
      await loadViewership();
      await loadBoard();
      setVwMsg('Saved.');
    });
  }

  async function clearViewership() {
    const character_id = selectedId();
    if (!character_id) return;
    if (!confirm(`Clear viewers, subscribers and rank for ${selectedName()}?`))
      return;

    await withBusy($('#btnVwClear'), 'Clearing…', async () => {
      const { error } = await supa.from('character_viewership').upsert(
        {
          character_id,
          viewers: null,
          subscribers: null,
          rank: null,
          updated_by: _user?.id ?? null,
        },
        { onConflict: 'character_id' }
      );
      if (error) {
        setVwMsg('Error clearing: ' + error.message);
        return;
      }
      await loadViewership();
      await loadBoard();
      setVwMsg('Cleared.');
    });
  }

  // ----------------------------
  // Standings across all characters
  // ----------------------------
  async function loadBoard() {
    const root = $('#dmVwBoard');
    if (!root) return;

    const { data, error } = await supa
      .from('character_viewership')
      .select('character_id, viewers, subscribers, rank');

    if (error) {
      root.textContent = 'Could not load standings: ' + error.message;
      return;
    }

    const byId = new Map((data || []).map((r) => [r.character_id, r]));
    const rows = _chars
      .map((c) => ({ id: c.id, name: c.name, ...(byId.get(c.id) || {}) }))
      .sort((a, b) => {
        // Ranked characters first (ascending), then by viewers descending.
        if (a.rank != null && b.rank != null) return a.rank - b.rank;
        if (a.rank != null) return -1;
        if (b.rank != null) return 1;
        return (b.viewers ?? -1) - (a.viewers ?? -1);
      });

    const sel = selectedId();
    root.innerHTML = `
      <table class="dm-table">
        <thead><tr>
          <th class="num">Rank</th><th>Character</th>
          <th class="num">Viewers</th><th class="num">Subscribers</th>
        </tr></thead>
        <tbody>
          ${rows
            .map(
              (r) => `<tr class="${r.id === sel ? 'is-selected' : ''}">
                <td class="num">${rankLabel(r.rank)}</td>
                <td>${escapeHtml(r.name)}</td>
                <td class="num">${num(r.viewers)}</td>
                <td class="num">${num(r.subscribers)}</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>`;
  }

  // ----------------------------
  // Access control
  // RLS is still the real enforcement; this keeps non-DMs off the page.
  // ----------------------------
  const BASE = window.APP_CONFIG?.basePath || '/';

  async function requireDm() {
    const {
      data: { user } = {},
      error,
    } = await supa.auth.getUser();
    if (error || !user) {
      window.location.href = `${BASE}login.html`;
      return null;
    }

    const { data: profile, error: roleErr } = await supa
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (roleErr && roleErr.code !== 'PGRST116') {
      setStatus('Could not verify your role: ' + roleErr.message);
      return null;
    }
    if (profile?.role !== 'dm') {
      window.location.href = `${BASE}character.html`;
      return null;
    }
    return user;
  }

  // ----------------------------
  // Wire up UI
  // ----------------------------
  window.addEventListener('load', async () => {
    const app = $('#dmApp');
    if (app) app.hidden = true;
    setStatus('Checking permissions…');

    const user = await requireDm();
    if (!user) return;
    _user = user;

    if (app) app.hidden = false;
    setStatus('');

    const acct = $('#dmAccount');
    if (acct) {
      const emailEl = $('#dmEmail');
      if (emailEl) emailEl.textContent = user.email || user.id;
      const charLink = $('#dmCharLink');
      if (charLink) charLink.href = `${BASE}character.html`;
      acct.hidden = false;
    }
    $('#dmLogout')?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        await supa.auth.signOut();
      } finally {
        window.location.replace(`${BASE}login.html`);
      }
    });

    $('#dmTabs')?.addEventListener('click', (e) => {
      const tab = e.target.closest('.tab');
      if (tab) showTab(tab.dataset.tab);
    });

    $('#dmRoster')?.addEventListener('click', (e) => {
      const item = e.target.closest('.roster-item');
      if (item) selectCharacter(item.dataset.id);
    });
    $('#dmSearch')?.addEventListener('input', renderRoster);
    $('#btnRefresh')?.addEventListener('click', () => loadChars());

    $('#btnGrantAch')?.addEventListener('click', () => grantAchievement(false));
    $('#btnGrantBox')?.addEventListener('click', () => grantBox(false));
    $('#btnGrantAchAll')?.addEventListener('click', () =>
      grantAchievement(true)
    );
    $('#btnGrantBoxAll')?.addEventListener('click', () => grantBox(true));

    ['#dmVwViewers', '#dmVwSubs', '#dmVwRank'].forEach((s) =>
      $(s)?.addEventListener('input', renderPreview)
    );
    document
      .querySelectorAll('input[name="dmVwMode"]')
      .forEach((el) => el.addEventListener('change', renderPreview));
    $('#btnVwSave')?.addEventListener('click', saveViewership);
    $('#btnVwClear')?.addEventListener('click', clearViewership);

    $('#dmOverview')?.addEventListener('click', (e) => {
      if (e.target.id === 'btnDeactivate') deactivateCharacter();
    });
    $('#btnReactivate')?.addEventListener('click', reactivateCharacter);
    $('#dmReactivateName')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') reactivateCharacter();
    });

    $('#dmEditForm')?.addEventListener('submit', saveEditSheet);
    $('#btnEdReload')?.addEventListener('click', () => loadEditSheet());

    loadChars();
  });
})();

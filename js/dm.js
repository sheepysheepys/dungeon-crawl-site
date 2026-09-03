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
  const setStatus = (t) => {
    const el = $('#dmStatus');
    if (el) el.textContent = t || '';
  };
  const setPartyMsg = (t) => {
    const el = $('#dmPartyMsg');
    if (el) el.textContent = t || '';
    if (t) setStatus(t);
  };
  const setInitMsg = (t) => {
    const el = $('#dmInitMsg');
    if (el) el.textContent = t || '';
    if (t) setStatus(t);
  };
  const setVwMsg = (t) => {
    const el = $('#dmVwMsg');
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
  function overviewStat(label, value, extraClass = '') {
    return `<div class="overview-stat">
      <span class="overview-stat-label">${escapeHtml(label)}</span>
      <span class="overview-stat-value ${extraClass}">${escapeHtml(
      String(value)
    )}</span>
    </div>`;
  }

  function overviewStatGrid(stats, cols) {
    return `<div class="overview-stat-grid cols-${cols}">${stats.join('')}</div>`;
  }

  function overviewSection(title, body, extraClass = '') {
    return `<section class="overview-section ${extraClass}">
      <h3 class="overview-section-title">${escapeHtml(title)}</h3>
      ${body}
    </section>`;
  }

  async function loadOverview() {
    const chId = selectedId();
    const root = $('#dmOverview');
    if (!root) return;
    if (!chId) {
      root.className = 'overview-root muted';
      root.textContent = 'Select a character.';
      return;
    }
    root.className = 'overview-root';
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
    const totalQty = (items.data || []).reduce(
      (n, r) => n + (Number(r.qty) || 0),
      0
    );

    const identity = overviewStatGrid(
      [
        overviewStat('Race', dash(c.race)),
        overviewStat('Class', dash(c.class)),
        overviewStat('Char level', dash(c.level)),
        overviewStat('Class level', dash(c.class_level ?? 1)),
        overviewStat(
          'Status',
          c.is_active === false ? 'Inactive' : 'Active',
          c.is_active === false ? 'low' : ''
        ),
      ],
      3
    );

    const vitals = overviewStatGrid(
      [
        overviewStat(
          'HP',
          `${dash(c.hp_current)} / ${dash(c.hp_total)}`,
          hpRatio <= 0.34 ? 'low' : ''
        ),
        overviewStat('Hope', dash(c.hope_points)),
        overviewStat('Evasion', dash(c.evasion)),
        overviewStat('Stress', dash(c.stress_points)),
        overviewStat(
          'Clothing',
          `${dash(c.exoskin_slots_remaining)} / ${dash(c.exoskin_slots_max)}`
        ),
        overviewStat('Thresholds', `${dash(c.dmg_t1)} / ${dash(c.dmg_t2)}`),
        overviewStat('Armor HP', dash(c.armor_hp)),
        overviewStat('Stripping', dash(c.stripping_level)),
      ],
      4
    );

    const abilities = overviewStatGrid(
      [
        overviewStat('STR', dash(s.stat_strength)),
        overviewStat('AGI', dash(s.stat_agility)),
        overviewStat('FIN', dash(s.stat_finesse)),
        overviewStat('INS', dash(s.stat_instinct)),
        overviewStat('PRE', dash(s.stat_presence)),
        overviewStat('KNO', dash(s.stat_knowledge)),
      ],
      6
    );

    const counts = overviewStatGrid(
      [
        overviewStat('Achievements', ach.count ?? 0),
        overviewStat('Unopened boxes', boxes.count ?? 0),
        overviewStat('Inventory items', totalQty),
        overviewStat('Experiences', (xp.data || []).length),
      ],
      4
    );

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
      ? `<ul class="overview-list">${(xp.data || [])
          .map(
            (x) =>
              `<li><span class="overview-list-name">${escapeHtml(
                x.xp_name
              )}</span><span class="overview-list-val">+${Number(
                x.xp_bonus ?? 0
              )}</span></li>`
          )
          .join('')}</ul>`
      : '<p class="overview-empty">No experiences.</p>';

    root.innerHTML = `
      ${overviewSection('Identity', identity)}
      ${overviewSection('Vitals', vitals)}
      ${overviewSection('Abilities', abilities, 'overview-section--abilities')}
      ${overviewSection('Totals', counts)}
      ${overviewSection('Equipped', equipTable, 'overview-section--table')}
      ${overviewSection('Experiences', xpList)}
      ${
        c.notes
          ? overviewSection(
              'Notes',
              `<p class="overview-notes">${escapeHtml(c.notes)}</p>`
            )
          : ''
      }
      <div class="action-group admin" style="margin-top:16px">
        <div class="action-group-label">Clothing (DM)</div>
        <div class="muted" style="margin-bottom:8px">
          Strip = full clothing loss (0/5). Restore = baseline 5/5 exo. Armor pieces stay equipped.
        </div>
        <div class="btn-row">
          <button id="btnOvStrip" type="button" class="btn-bad">Strip −1 clothing</button>
          <button id="btnOvRestore" type="button" class="btn-good">Restore clothing (5/5)</button>
        </div>
      </div>
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
      form.querySelectorAll('input, textarea, select').forEach((el) => {
        el.value = '';
        el.disabled = true;
      });
      return;
    }

    form.querySelectorAll('input, textarea, select').forEach((el) => {
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
    setInput(
      '#dmEdClothingTemplate',
      window.App?.Features?.dressCode?.inferTemplate?.(c.clothing_layers) ||
        'extra'
    );
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
      const template =
        readText('#dmEdClothingTemplate') || 'extra';
      const clothingLayers =
        window.App?.Features?.dressCode?.getTemplateLayers?.(template) ||
        null;

      const charPatch = {
        name: readText('#dmEdName') || null,
        race: readText('#dmEdRace') || null,
        class: readText('#dmEdClass') || null,
        level: readNum('#dmEdLevel'),
        class_level: readNum('#dmEdClassLevel'),
        clothing_layers: clothingLayers,
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

      let clothingLayersSkipped = false;
      let { error: charErr } = await supa
        .from('characters')
        .update(charPatch)
        .eq('id', chId);
      if (
        charErr &&
        /clothing_layers/i.test(String(charErr.message || ''))
      ) {
        const { clothing_layers: _drop, ...withoutLayers } = charPatch;
        ({ error: charErr } = await supa
          .from('characters')
          .update(withoutLayers)
          .eq('id', chId));
        if (!charErr) clothingLayersSkipped = true;
      }
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
      setEditMsg(
        clothingLayersSkipped
          ? 'Saved (clothing template skipped — run sql/019_clothing_preset.sql in Supabase).'
          : 'Saved. Player should refresh their sheet to see changes.'
      );
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
  const LS_LAST_ACH = 'dmLastAchTitle';
  const LS_LAST_DESC = 'dmLastAchDesc';
  const LS_LAST_BOX_TYPE = 'dmLastBoxType';
  const LS_LAST_BOX_RARITY = 'dmLastBoxRarity';
  const DEFAULT_ACH_PRESETS = [
    'Great roleplay',
    'Brave stand',
    'Funny moment',
    'Team player',
  ];

  function saveLastAchievement(title, description) {
    try {
      if (title) localStorage.setItem(LS_LAST_ACH, title);
      if (description) localStorage.setItem(LS_LAST_DESC, description);
    } catch {}
  }

  function saveLastBox(type, rarity) {
    try {
      if (type) localStorage.setItem(LS_LAST_BOX_TYPE, type);
      if (rarity) localStorage.setItem(LS_LAST_BOX_RARITY, rarity);
    } catch {}
  }

  function lastAchievement() {
    return {
      title: localStorage.getItem(LS_LAST_ACH) || '',
      description: localStorage.getItem(LS_LAST_DESC) || '',
    };
  }

  function lastBox() {
    return {
      boxType: localStorage.getItem(LS_LAST_BOX_TYPE) || 'general',
      rarity: localStorage.getItem(LS_LAST_BOX_RARITY) || 'common',
    };
  }

  function keepGrantForm() {
    return $('#dmKeepGrantForm')?.checked !== false;
  }

  function syncQuickGrantHint() {
    const el = $('#dmQuickGrantHint');
    if (!el) return;
    const last = lastAchievement();
    const box = lastBox();
    el.textContent = last.title
      ? `Last: "${last.title}" · Box: ${box.boxType} ${box.rarity}`
      : 'Set a title once — presets and repeat buttons reuse it.';
  }

  function renderGrantPresets() {
    const root = $('#dmGrantPresets');
    if (!root) return;
    root.innerHTML = DEFAULT_ACH_PRESETS.map(
      (p) =>
        `<button type="button" class="btn-tiny quick-preset" data-preset="${escapeHtml(p)}">${escapeHtml(p)}</button>`
    ).join('');
  }

  function targetIds(all) {
    if (all) return _chars.map((c) => c.id);
    const id = selectedId();
    return id ? [id] : [];
  }

  async function grantAchievementToIds(ids, { title, description, btn, confirmAllLabel }) {
    if (!ids.length) {
      setMsg('Pick a character first.');
      return;
    }
    if (!title) {
      setMsg('Enter an achievement title.');
      return;
    }
    if (confirmAllLabel && !confirm(confirmAllLabel)) return;

    await withBusy(btn, 'Granting…', async () => {
      try {
        const awarded_at = new Date().toISOString();
        const rows = ids.map((character_id) => ({
          character_id,
          title,
          description: description || null,
          awarded_at,
        }));

        const { error } = await supa.from('achievements').insert(rows);
        if (error) throw error;

        saveLastAchievement(title, description);
        syncQuickGrantHint();

        const name =
          ids.length === 1
            ? _chars.find((c) => c.id === ids[0])?.name || 'character'
            : `${ids.length} characters`;
        setMsg(`Achievement "${title}" → ${name}.`);
        setStatus(`Granted: ${title}`);

        if (!keepGrantForm()) {
          if ($('#dmTitle')) $('#dmTitle').value = '';
          if ($('#dmDesc')) $('#dmDesc').value = '';
          if ($('#dmQuickTitle')) $('#dmQuickTitle').value = '';
        } else {
          if ($('#dmTitle')) $('#dmTitle').value = title;
          if ($('#dmQuickTitle')) $('#dmQuickTitle').value = title;
        }

        await loadOverview();
      } catch (e) {
        console.error('[dm] grantAchievement', e);
        setMsg('Error: ' + (e?.message || e));
      }
    });
  }

  async function grantBoxToIds(ids, { rarity, boxType, btn, confirmAllLabel }) {
    if (!ids.length) {
      setMsg('Pick a character first.');
      return;
    }
    if (!rarity || !boxType) {
      setMsg('Pick box type and rarity.');
      return;
    }
    if (confirmAllLabel && !confirm(confirmAllLabel)) return;

    await withBusy(btn, 'Granting…', async () => {
      const results = await Promise.allSettled(
        ids.map((id) =>
          supa
            .rpc('rpc_give_and_seed_loot_box', {
              p_character_id: id,
              p_box_rarity: rarity,
              p_box_type: boxType,
            })
            .then(({ error }) => {
              if (error) throw error;
            })
        )
      );

      const failed = results.filter((r) => r.status === 'rejected');
      failed.forEach((f) => console.error('[dm] grantBox', f.reason));

      saveLastBox(boxType, rarity);
      syncQuickGrantHint();

      const name =
        ids.length === 1
          ? _chars.find((c) => c.id === ids[0])?.name || 'character'
          : `${ids.length} characters`;

      if (!failed.length) {
        setMsg(`Loot box (${boxType} ${rarity}) → ${name}.`);
        setStatus(`Loot box: ${boxType} ${rarity}`);
      } else {
        const ok = results.length - failed.length;
        setMsg(
          `Granted ${ok} of ${results.length}. First error: ${
            failed[0]?.reason?.message || failed[0]?.reason
          }`
        );
      }
      await loadOverview();
    });
  }

  async function grantAchievement(all) {
    const btn = all ? $('#btnGrantAchAll') : $('#btnGrantAch');
    const title = $('#dmTitle')?.value?.trim() || '';
    const description = $('#dmDesc')?.value?.trim() || '';
    const ids = targetIds(all);
    await grantAchievementToIds(ids, {
      title,
      description,
      btn,
      confirmAllLabel: all
        ? `Grant "${title}" to all ${ids.length} active characters?`
        : null,
    });
  }

  async function grantBox(all) {
    const btn = all ? $('#btnGrantBoxAll') : $('#btnGrantBox');
    const rarity = $('#dmRarity')?.value;
    const boxType = $('#dmBoxType')?.value || 'general';
    const ids = targetIds(all);
    await grantBoxToIds(ids, {
      rarity,
      boxType,
      btn,
      confirmAllLabel: all
        ? `Grant a ${rarity} ${boxType} loot box to all ${ids.length} active characters?`
        : null,
    });
  }

  async function quickGrantAchievement(charId) {
    const title =
      $('#dmQuickTitle')?.value?.trim() ||
      $('#dmTitle')?.value?.trim() ||
      lastAchievement().title;
    const description =
      $('#dmDesc')?.value?.trim() || lastAchievement().description;
    const ids = charId ? [charId] : targetIds(false);
    await grantAchievementToIds(ids, {
      title,
      description,
      btn: $('#btnQuickGrantAch'),
    });
  }

  async function quickGrantBox(charId) {
    const rarity = $('#dmRarity')?.value || lastBox().rarity;
    const boxType = $('#dmBoxType')?.value || lastBox().boxType;
    const ids = charId ? [charId] : targetIds(false);
    await grantBoxToIds(ids, {
      rarity,
      boxType,
      btn: $('#btnQuickGrantBox'),
    });
  }

  function wireQuickGrants() {
    renderGrantPresets();
    syncQuickGrantHint();

    const last = lastAchievement();
    if (last.title && $('#dmQuickTitle')) $('#dmQuickTitle').value = last.title;
    if (last.title && $('#dmTitle')) $('#dmTitle').value = last.title;

    const box = lastBox();
    if ($('#dmBoxType')) $('#dmBoxType').value = box.boxType;
    if ($('#dmRarity')) $('#dmRarity').value = box.rarity;

    $('#dmGrantPresets')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-preset]');
      if (!btn) return;
      const title = btn.getAttribute('data-preset') || '';
      if ($('#dmQuickTitle')) $('#dmQuickTitle').value = title;
      if ($('#dmTitle')) $('#dmTitle').value = title;
    });

    $('#btnQuickGrantAch')?.addEventListener('click', () => quickGrantAchievement());
    $('#btnQuickGrantBox')?.addEventListener('click', () => quickGrantBox());
    $('#btnQuickRepeatAch')?.addEventListener('click', () => {
      const { title } = lastAchievement();
      if (!title) {
        setMsg('No last achievement yet — use a preset or enter a title.');
        return;
      }
      if ($('#dmQuickTitle')) $('#dmQuickTitle').value = title;
      quickGrantAchievement();
    });
    $('#btnQuickRepeatBox')?.addEventListener('click', () => quickGrantBox());
  }

  function syncClothingDisplayButtons(mode) {
    const bar = $('#btnClothingBar');
    const slots = $('#btnClothingSlots');
    if (bar) bar.classList.toggle('is-active', mode === 'bar');
    if (slots) slots.classList.toggle('is-active', mode === 'slots');
  }

  async function wireClothingDisplay() {
    const dressCode = window.App?.Features?.dressCode;
    if (!dressCode) return;

    let mode = await dressCode.refresh(supa);
    syncClothingDisplayButtons(mode);

    const apply = async (next) => {
      mode = await dressCode.setMode(supa, next);
      syncClothingDisplayButtons(mode);
      setPartyMsg(
        mode === 'slots'
          ? 'All sheets: clothing by piece (Legs, Shirt, Socks…)'
          : 'All sheets: clothing summary bar'
      );
    };

    $('#btnClothingBar')?.addEventListener('click', () => apply('bar'));
    $('#btnClothingSlots')?.addEventListener('click', () => apply('slots'));
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
    const badgeMap = await fetchViewershipBadges(_chars.map((c) => c.id));
    root.innerHTML = `
      <table class="dm-table">
        <thead><tr>
          <th class="num">Rank</th><th>Character</th>
          <th class="num">Viewers</th><th class="num">Subscribers</th>
        </tr></thead>
        <tbody>
          ${rows
            .map(
              (r) => {
                const badge = badgeMap.get(r.id);
                const badgeHtml = badge
                  ? `${vwBadgeEmoji(badge)} `
                  : '';
                return `<tr class="${r.id === sel ? 'is-selected' : ''}">
                <td class="num">${rankLabel(r.rank)}</td>
                <td>${badgeHtml}${escapeHtml(r.name)}</td>
                <td class="num">${num(r.viewers)}</td>
                <td class="num">${num(r.subscribers)}</td>
              </tr>`;
              }
            )
            .join('')}
        </tbody>
      </table>`;
  }

  const ARMOR_SLOTS = ['head', 'chest', 'legs', 'hands', 'feet'];
  const INIT_STORAGE_KEY = 'dm_initiative_v1';

  let _initState = { order: [], turn: 0 };
  let _initDragIdx = null;

  function clampTurn() {
    if (!_initState.order.length) {
      _initState.turn = 0;
      return;
    }
    if (_initState.turn >= _initState.order.length) _initState.turn = 0;
    if (_initState.turn < 0) _initState.turn = 0;
  }

  function moveInitEntry(fromIdx, toIdx) {
    if (fromIdx === toIdx) return;
    const [moved] = _initState.order.splice(fromIdx, 1);
    _initState.order.splice(toIdx, 0, moved);
    if (_initState.turn === fromIdx) _initState.turn = toIdx;
    else if (fromIdx < _initState.turn && toIdx >= _initState.turn) {
      _initState.turn -= 1;
    } else if (fromIdx > _initState.turn && toIdx <= _initState.turn) {
      _initState.turn += 1;
    }
    clampTurn();
  }

  function loadInitStateFromStorage() {
    try {
      const raw = localStorage.getItem(INIT_STORAGE_KEY);
      if (raw) _initState = JSON.parse(raw);
    } catch {
      _initState = { order: [], turn: 0 };
    }
    if (!Array.isArray(_initState.order)) _initState.order = [];
    if (!Number.isFinite(Number(_initState.turn))) _initState.turn = 0;
  }

  function saveInitStateToStorage() {
    localStorage.setItem(INIT_STORAGE_KEY, JSON.stringify(_initState));
  }

  function sortInitiativeOrder() {
    _initState.order.sort((a, b) => {
      const diff = Number(b.init || 0) - Number(a.init || 0);
      if (diff !== 0) return diff;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    clampTurn();
  }

  async function ensureExoRowsForChar(chId) {
    const { data: existing } = await supa
      .from('character_equipment')
      .select('slot')
      .eq('character_id', chId)
      .in('slot', ARMOR_SLOTS);
    const have = new Set((existing || []).map((r) => r.slot));
    const missing = ARMOR_SLOTS.filter((s) => !have.has(s));
    if (missing.length) {
      await supa.from('character_equipment').insert(
        missing.map((slot) => ({
          character_id: chId,
          slot,
          item_id: null,
          slots_remaining: 0,
          exo_left: 1,
        }))
      );
    }
  }

  async function restoreClothingBaselineClient(chId) {
    await ensureExoRowsForChar(chId);
    const { error: eqErr } = await supa
      .from('character_equipment')
      .update({ exo_left: 1 })
      .eq('character_id', chId)
      .in('slot', ARMOR_SLOTS);
    const { error: chErr } = await supa
      .from('characters')
      .update({ exoskin_slots_remaining: 5 })
      .eq('id', chId);
    return !eqErr && !chErr;
  }

  async function stripOneClothingLayer(chId, name) {
    await ensureExoRowsForChar(chId);

    const { data: rows, error: qErr } = await supa
      .from('character_equipment')
      .select('id, slot, exo_left')
      .eq('character_id', chId)
      .in('slot', ARMOR_SLOTS);

    if (qErr) {
      setPartyMsg('Strip failed: ' + qErr.message);
      return false;
    }

    const candidates = (rows || []).filter((r) => Number(r.exo_left ?? 0) > 0);
    if (!candidates.length) {
      setPartyMsg(`${name} already has no clothing layers left.`);
      return false;
    }

    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    const { error: upErr } = await supa
      .from('character_equipment')
      .update({ exo_left: 0 })
      .eq('id', pick.id);

    if (upErr) {
      setPartyMsg('Strip failed: ' + upErr.message);
      return false;
    }

    let chRowRes = await supa
      .from('characters')
      .select('exoskin_slots_remaining, clothing_layers')
      .eq('id', chId)
      .maybeSingle();
    if (
      chRowRes.error &&
      /clothing_layers/i.test(String(chRowRes.error.message || ''))
    ) {
      chRowRes = await supa
        .from('characters')
        .select('exoskin_slots_remaining')
        .eq('id', chId)
        .maybeSingle();
    }
    const chRow = chRowRes.data;
    const curExo = Math.max(0, Number(chRow?.exoskin_slots_remaining ?? 0));
    const nextExo = Math.max(0, curExo - 1);
    await supa
      .from('characters')
      .update({ exoskin_slots_remaining: nextExo })
      .eq('id', chId);

    const piece = window.App?.Features?.dressCode?.getLabelFromLayers?.(
      chRow?.clothing_layers,
      pick.slot
    );
    const quip = window.App?.Features?.flavor?.stripQuip?.({ stripHits: 1 });
    if (quip) setPartyMsg(`${quip} · ${name} (${piece}) −1 layer`);
    else setPartyMsg(`Stripped 1 clothing layer from ${name} (${piece}).`);
    return true;
  }

  async function forceRestoreClothing(chId, name) {
    if (
      !confirm(
        `Restore clothing baseline (5/5) for ${name}? Equipped armor unchanged.`
      )
    ) {
      return false;
    }

    const { error: rpcErr } = await supa.rpc('rpc_restore_clothing_baseline', {
      p_character_id: chId,
    });

    if (!rpcErr) {
      setPartyMsg(`Clothing restored to 5/5 for ${name}.`);
      return true;
    }

    const ok = await restoreClothingBaselineClient(chId);
    if (ok) {
      setPartyMsg(`Clothing restored to 5/5 for ${name}.`);
      return true;
    }

    setPartyMsg(
      'Restore failed: ' +
        rpcErr.message +
        ' (also tried direct update — check DM permissions / RLS)'
    );
    return false;
  }

  function exoCountFromRows(rows) {
    return (rows || []).filter((r) => Number(r.exo_left ?? 0) > 0).length;
  }

  function depletedArmorCount(rows) {
    return (rows || []).filter((r) => {
      const max = Number(r.item?.armor_value || 0);
      return r.item_id && max > 0 && Number(r.slots_remaining ?? 0) < max;
    }).length;
  }

  async function forceStripClothing(chId, name) {
    return stripOneClothingLayer(chId, name);
  }

  function vwBadgeEmoji(type) {
    if (type === 'crown') return '👑';
    if (type === 'underdog') return '🐸';
    return '';
  }

  async function fetchViewershipBadges(charIds) {
    const out = new Map();
    if (!charIds?.length) return out;

    const { data: vw } = await supa
      .from('character_viewership')
      .select('character_id, viewers')
      .in('character_id', charIds);

    const rows = (vw || []).filter((r) => Number.isFinite(Number(r.viewers)));
    if (rows.length < 2) return out;

    const counts = rows.map((r) => Number(r.viewers));
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    if (max === min) return out;

    for (const r of rows) {
      const n = Number(r.viewers);
      if (n === max) out.set(r.character_id, 'crown');
      else if (n === min) out.set(r.character_id, 'underdog');
    }
    return out;
  }

  async function loadPartyDashboard() {
    const root = $('#dmPartyBoard');
    if (!root) return;
    root.textContent = 'Loading…';

    const ids = _chars.map((c) => c.id);
    if (!ids.length) {
      root.textContent = 'No active characters.';
      return;
    }

    const [charsRes, eqRes, vwBadges] = await Promise.all([
      supa
        .from('characters')
        .select(
          'id,name,hp_current,hp_total,hope_points,evasion,exoskin_slots_remaining,exoskin_slots_max'
        )
        .in('id', ids),
      supa
        .from('character_equipment')
        .select(
          'character_id, slot, exo_left, slots_remaining, item_id, item:items(armor_value)'
        )
        .in('character_id', ids)
        .in('slot', ARMOR_SLOTS),
      fetchViewershipBadges(ids),
    ]);

    if (charsRes.error) {
      root.textContent = 'Could not load party: ' + charsRes.error.message;
      return;
    }

    const byId = new Map((charsRes.data || []).map((c) => [c.id, c]));
    const eqByChar = new Map();
    for (const row of eqRes.data || []) {
      const list = eqByChar.get(row.character_id) || [];
      list.push(row);
      eqByChar.set(row.character_id, list);
    }

    const exoValues = [];

    const rows = _chars
      .map((c) => {
        const ch = byId.get(c.id) || c;
        const eq = eqByChar.get(c.id) || [];
        let exo = exoCountFromRows(eq);
        if (!exo && Number(ch.exoskin_slots_remaining) > 0) {
          exo = Math.min(5, Number(ch.exoskin_slots_remaining));
        }
        exoValues.push(exo);
        const hpCur = Number(ch.hp_current ?? 0);
        const hpTot = Math.max(1, Number(ch.hp_total ?? 1));
        const hpPct = Math.max(0, Math.min(100, (hpCur / hpTot) * 100));
        const hpClass =
          hpCur <= 0 ? 'hp-down' : hpPct <= 34 ? 'hp-low' : 'hp-ok';
        const depleted = depletedArmorCount(eq);
        const badge = vwBadges.get(c.id);
        const badgeHtml = badge
          ? `<span class="party-vw-badge" title="${badge === 'crown' ? 'Most viewers' : 'Fewest viewers'}">${vwBadgeEmoji(badge)}</span> `
          : '';
        return `<tr class="${c.id === _selectedId ? 'is-selected' : ''}" data-char="${escapeHtml(c.id)}">
          <td><button type="button" class="linkish party-name" data-char="${escapeHtml(c.id)}">${badgeHtml}${escapeHtml(ch.name || c.id)}</button></td>
          <td class="party-hp">
            <div class="party-hp-bar ${hpClass}" style="width:${hpPct.toFixed(0)}%"></div>
            <span class="party-hp-text mono">${hpCur}/${hpTot}</span>
          </td>
          <td class="num mono ${exo <= 1 ? 'low' : ''}">${exo}/5</td>
          <td class="num mono ${depleted ? 'low' : ''}">${depleted || '—'}</td>
          <td class="num mono">${dash(ch.hope_points)}</td>
          <td class="num mono">${dash(ch.evasion)}</td>
          <td class="party-actions">
            <button type="button" class="btn-tiny" data-action="q-ach" data-char="${escapeHtml(c.id)}" title="Quick achievement">🏆</button>
            <button type="button" class="btn-tiny" data-action="q-box" data-char="${escapeHtml(c.id)}" title="Quick loot box">📦</button>
            <button type="button" class="btn-tiny btn-bad" data-action="strip" data-char="${escapeHtml(c.id)}">−1</button>
            <button type="button" class="btn-tiny btn-good" data-action="restore" data-char="${escapeHtml(c.id)}">5/5</button>
          </td>
        </tr>`;
      })
      .join('');

    const avgExo =
      exoValues.length > 0
        ? exoValues.reduce((a, b) => a + b, 0) / exoValues.length
        : 0;
    const minExo = exoValues.length ? Math.min(...exoValues) : 0;
    const maxExo = exoValues.length ? Math.max(...exoValues) : 0;
    const avgRounded = Math.round(avgExo * 10) / 10;
    const avgPct = Math.max(0, Math.min(100, (avgExo / 5) * 100));
    const meterClass =
      avgExo <= 1.5 ? 'party-meter--low' : avgExo <= 3 ? 'party-meter--mid' : 'party-meter--high';

    const meterPips = Array.from({ length: 5 })
      .map((_, i) => `<span class="party-pip${i < Math.round(avgExo) ? ' filled' : ''}"></span>`)
      .join('');

    root.innerHTML = `
      <div class="party-clothing-meter ${meterClass}">
        <div class="party-meter-head">
          <span class="party-meter-label">Party clothing average</span>
          <span class="party-meter-value mono"><strong>${avgRounded}</strong> / 5</span>
        </div>
        <div class="party-meter-bar"><div class="party-meter-fill" style="width:${avgPct}%"></div></div>
        <div class="party-meter-pips" aria-hidden="true">${meterPips}</div>
        <div class="party-meter-range muted">Low ${minExo}/5 · High ${maxExo}/5 · strip toward ~${avgRounded} for parity</div>
      </div>
      <table class="dm-table party-table">
        <thead><tr>
          <th>Character</th>
          <th>HP</th>
          <th class="num">Clothing</th>
          <th class="num">Armor↓</th>
          <th class="num">Hope</th>
          <th class="num">Evasion</th>
          <th>Actions</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="muted" style="margin-top:8px;font-size:12px">
        Clothing = exo layers left · Armor↓ = depleted equipped pieces · −1 = strip one layer · 5/5 = restore all clothing
      </div>`;
  }

  function renderInitiative() {
    const listEl = $('#dmInitList');
    const currentEl = $('#dmInitCurrent');
    if (!listEl || !currentEl) return;

    clampTurn();
    saveInitStateToStorage();

    if (!_initState.order.length) {
      listEl.innerHTML = '';
      currentEl.textContent = 'Add combatants or roll initiative to begin.';
      return;
    }

    const cur = _initState.order[_initState.turn];
    currentEl.innerHTML = cur
      ? `<strong>Now:</strong> ${escapeHtml(cur.name)} <span class="mono muted">(init ${cur.init})</span>`
      : '—';

    listEl.innerHTML = _initState.order
      .map((entry, i) => {
        const active = i === _initState.turn ? ' is-active' : '';
        const npc = entry.npc ? ' npc' : '';
        return `<li class="init-item${active}${npc}" data-idx="${i}">
          <span class="init-drag" draggable="true" title="Drag to reorder">⋮⋮</span>
          <span class="init-rank mono">${i + 1}</span>
          <span class="init-name">${escapeHtml(entry.name)}</span>
          <input class="init-val mono" type="number" value="${Number(entry.init || 0)}" data-idx="${i}" aria-label="Initiative" />
          <button type="button" class="btn-tiny init-rm" data-idx="${i}" title="Remove">×</button>
        </li>`;
      })
      .join('');
  }

  function wireInitiativeDragDrop() {
    const list = $('#dmInitList');
    if (!list || list._dragWired) return;
    list._dragWired = true;

    list.addEventListener('dragstart', (e) => {
      const handle = e.target.closest('.init-drag');
      if (!handle) {
        e.preventDefault();
        return;
      }
      const item = handle.closest('.init-item');
      if (!item) return;
      _initDragIdx = Number(item.dataset.idx);
      item.classList.add('init-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(_initDragIdx));
    });

    list.addEventListener('dragend', (e) => {
      list.querySelectorAll('.init-item').forEach((el) => {
        el.classList.remove('init-dragging', 'init-drop-target');
      });
      _initDragIdx = null;
    });

    list.addEventListener('dragover', (e) => {
      e.preventDefault();
      const item = e.target.closest('.init-item');
      list.querySelectorAll('.init-drop-target').forEach((el) => {
        el.classList.remove('init-drop-target');
      });
      if (item) item.classList.add('init-drop-target');
    });

    list.addEventListener('drop', (e) => {
      e.preventDefault();
      const target = e.target.closest('.init-item');
      if (!target || _initDragIdx == null) return;
      const toIdx = Number(target.dataset.idx);
      if (!Number.isFinite(toIdx)) return;
      moveInitEntry(_initDragIdx, toIdx);
      renderInitiative();
      setInitMsg('Turn order updated.');
    });
  }

  function rollAllPcInitiative() {
    _initState.order = _initState.order.filter((e) => e.npc);
    for (const c of _chars) {
      if (_initState.order.some((e) => e.id === c.id)) continue;
      const init = Math.floor(Math.random() * 20) + 1;
      _initState.order.push({
        id: c.id,
        name: c.name || c.id,
        init,
        npc: false,
      });
    }
    _initState.turn = 0;
    renderInitiative();
    setInitMsg('Rolled initiative — drag rows to set turn order.');
  }

  function addSelectedPcToInitiative() {
    const c = selectedChar();
    if (!c) {
      setInitMsg('Select a character from the roster first.');
      return;
    }
    if (_initState.order.some((e) => e.id === c.id)) {
      setInitMsg(`${c.name} is already on the tracker.`);
      return;
    }
    _initState.order.push({
      id: c.id,
      name: c.name || c.id,
      init: 10,
      npc: false,
    });
    renderInitiative();
    setInitMsg(`Added ${c.name} — drag to reorder.`);
  }

  function addNpcToInitiative() {
    const name = ($('#initNpcName')?.value || '').trim();
    const init = Number($('#initNpcVal')?.value);
    if (!name) {
      setInitMsg('Enter an NPC name.');
      $('#initNpcName')?.focus();
      return;
    }
    if (!Number.isFinite(init)) {
      setInitMsg('Enter an initiative number.');
      $('#initNpcVal')?.focus();
      return;
    }
    _initState.order.push({
      id: 'npc-' + Date.now(),
      name,
      init,
      npc: true,
    });
    if ($('#initNpcName')) $('#initNpcName').value = '';
    if ($('#initNpcVal')) $('#initNpcVal').value = '';
    renderInitiative();
    setInitMsg(`Added NPC ${name} — drag to reorder.`);
  }

  function clearInitiative() {
    if (_initState.order.length && !confirm('Clear initiative tracker?')) return;
    _initState = { order: [], turn: 0 };
    renderInitiative();
  }

  function advanceInitiative(delta) {
    if (!_initState.order.length) return;
    const n = _initState.order.length;
    _initState.turn = (((_initState.turn + delta) % n) + n) % n;
    renderInitiative();
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
      if (!tab) return;
      showTab(tab.dataset.tab);
      if (tab.dataset.tab === 'party') loadPartyDashboard();
      if (tab.dataset.tab === 'initiative') renderInitiative();
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

    $('#dmOverview')?.addEventListener('click', async (e) => {
      if (e.target.id === 'btnDeactivate') return deactivateCharacter();
      const chId = selectedId();
      const name = selectedName();
      if (e.target.id === 'btnOvStrip') {
        if (await forceStripClothing(chId, name)) {
          await loadOverview();
          await loadPartyDashboard();
        }
      }
      if (e.target.id === 'btnOvRestore') {
        if (await forceRestoreClothing(chId, name)) {
          await loadOverview();
          await loadPartyDashboard();
        }
      }
    });

    $('#dmPartyBoard')?.addEventListener('click', async (e) => {
      const nameBtn = e.target.closest('.party-name');
      if (nameBtn?.dataset.char) {
        await selectCharacter(nameBtn.dataset.char);
        showTab('overview');
        return;
      }
      const btn = e.target.closest('button[data-action]');
      if (!btn?.dataset.char) return;
      const chId = btn.dataset.char;
      const ch = _chars.find((c) => c.id === chId);
      const label = ch?.name || chId;
      if (btn.dataset.action === 'strip') {
        if (await forceStripClothing(chId, label)) await loadPartyDashboard();
      }
      if (btn.dataset.action === 'restore') {
        if (await forceRestoreClothing(chId, label)) await loadPartyDashboard();
      }
      if (btn.dataset.action === 'q-ach') {
        await quickGrantAchievement(chId);
      }
      if (btn.dataset.action === 'q-box') {
        await quickGrantBox(chId);
      }
    });
    $('#btnPartyRefresh')?.addEventListener('click', () => loadPartyDashboard());

    loadInitStateFromStorage();
    wireInitiativeDragDrop();
    $('#btnInitRollAll')?.addEventListener('click', rollAllPcInitiative);
    $('#btnInitAddPc')?.addEventListener('click', addSelectedPcToInitiative);
    $('#btnInitAddNpc')?.addEventListener('click', addNpcToInitiative);
    $('#initNpcName')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addNpcToInitiative();
    });
    $('#initNpcVal')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addNpcToInitiative();
    });
    $('#btnInitClear')?.addEventListener('click', clearInitiative);
    $('#btnInitPrev')?.addEventListener('click', () => advanceInitiative(-1));
    $('#btnInitNext')?.addEventListener('click', () => advanceInitiative(1));
    $('#dmInitList')?.addEventListener('click', (e) => {
      const rm = e.target.closest('.init-rm');
      if (rm) {
        e.stopPropagation();
        const idx = Number(rm.dataset.idx);
        if (!Number.isFinite(idx)) return;
        _initState.order.splice(idx, 1);
        if (_initState.turn >= _initState.order.length) _initState.turn = 0;
        renderInitiative();
        return;
      }
      const item = e.target.closest('.init-item');
      if (!item || e.target.closest('input')) return;
      _initState.turn = Number(item.dataset.idx) || 0;
      renderInitiative();
    });
    $('#dmInitList')?.addEventListener('change', (e) => {
      const input = e.target.closest('.init-val');
      if (!input) return;
      const idx = Number(input.dataset.idx);
      if (!Number.isFinite(idx) || !_initState.order[idx]) return;
      _initState.order[idx].init = Number(input.value) || 0;
      renderInitiative();
    });
    $('#btnReactivate')?.addEventListener('click', reactivateCharacter);
    $('#dmReactivateName')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') reactivateCharacter();
    });

    $('#dmEditForm')?.addEventListener('submit', saveEditSheet);
    $('#btnEdReload')?.addEventListener('click', () => loadEditSheet());
    $('#btnEdRestoreClothing')?.addEventListener('click', async () => {
      const chId = selectedId();
      if (!chId) {
        setEditMsg('Select a character first.');
        return;
      }
      if (
        !confirm(
          'Restore clothing to 5/5 exo? This does not re-equip stripped armor pieces.'
        )
      ) {
        return;
      }
      const btn = $('#btnEdRestoreClothing');
      await withBusy(btn, 'Restoring…', async () => {
        const { error: rpcErr } = await supa.rpc('rpc_restore_clothing_baseline', {
          p_character_id: chId,
        });
        if (rpcErr) {
          const ok = await restoreClothingBaselineClient(chId);
          if (!ok) {
            setEditMsg(
              'Restore failed: ' +
                rpcErr.message +
                ' (also tried direct update — check DM permissions / RLS)'
            );
            return;
          }
        }
        setEditMsg('Clothing baseline restored to 5/5.');
        await loadOverview();
        await loadPartyDashboard();
      });
    });

    loadChars();
    wireQuickGrants();
    wireClothingDisplay();
  });
})();

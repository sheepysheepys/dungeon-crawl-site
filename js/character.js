function wireLevelUp() {
  const openBtn = document.getElementById('btnLevelUp');
  const back = document.getElementById('levelModalBack');
  const closeBtn = document.getElementById('btnCloseLevelModal');
  const confirmBtn = document.getElementById('btnConfirmLevelUp');
  const choiceHp = document.getElementById('luChoiceHp');
  const choiceStat = document.getElementById('luChoiceStat');
  const abilitySel = document.getElementById('luAbilityKey');

  if (!openBtn || !back) return;

  function updateUIForChoice() {
    const statSelected = choiceStat?.checked;
    if (abilitySel) abilitySel.disabled = !statSelected;

    // Enable confirm if: HP bonus is chosen OR stat bonus chosen with a value
    const canConfirm =
      choiceHp?.checked === true ||
      (statSelected &&
        abilitySel &&
        abilitySel.value &&
        abilitySel.value !== '');
    if (confirmBtn) confirmBtn.disabled = !canConfirm;
  }

  // Populate abilities on open, reset UI
  openBtn.addEventListener('click', async () => {
    back.classList.add('show');

    const sb = window.sb;
    const ch = window.AppState?.character;
    if (!sb || !ch?.id || !abilitySel) return;

    try {
      const { data: statsRow, error } = await sb
        .from('character_stats')
        .select('*') // tolerant select
        .eq('character_id', ch.id)
        .maybeSingle();

      if (error) {
        console.warn('[levelup] stats read error', error);
        abilitySel.innerHTML = `<option value="">(no stats table)</option>`;
      } else {
        const keys = Object.keys(statsRow || {}).filter((k) => {
          if (
            k === 'id' ||
            k === 'character_id' ||
            k === 'created_at' ||
            k === 'updated_at'
          )
            return false;
          return Number.isFinite(Number(statsRow[k]));
        });

        abilitySel.innerHTML = keys.length
          ? `<option value="">— choose a stat —</option>` +
            keys
              .map(
                (k) => `<option value="${k}">${k.replace(/_/g, ' ')}</option>`
              )
              .join('')
          : `<option value="">(no numeric stats found)</option>`;
      }
    } catch (e) {
      console.warn('[levelup] dropdown populate failed', e);
      abilitySel.innerHTML = `<option value="">(error)</option>`;
    }

    // Default choice each time modal opens
    if (abilitySel) abilitySel.value = ''; // clear old selection
    if (choiceHp) choiceHp.checked = true;
    if (choiceStat) choiceStat.checked = false;
    if (abilitySel) abilitySel.disabled = true;

    updateUIForChoice();
  });

  // Choice toggles
  choiceHp?.addEventListener('change', updateUIForChoice);
  choiceStat?.addEventListener('change', updateUIForChoice);
  abilitySel?.addEventListener('change', updateUIForChoice);

  // Close
  closeBtn?.addEventListener('click', () => back.classList.remove('show'));

  // Confirm: baseline +1 Max HP; bonus = extra +1 HP OR +1 stat
  confirmBtn?.addEventListener('click', async () => {
    const sb = window.sb;
    const ch = window.AppState?.character;
    if (!sb || !ch?.id) return;

    const takeExtraHp = choiceHp?.checked === true;
    const statKey =
      choiceStat?.checked && abilitySel && abilitySel.value
        ? abilitySel.value
        : '';

    if (!takeExtraHp && !statKey) {
      setText?.('msg', 'Choose one bonus: extra +1 HP or a stat to raise.');
      return;
    }

    // Baseline +1 HP always; +1 more if HP bonus chosen
    const hpGain = 1 + (takeExtraHp ? 1 : 0);
    const nextLevel = Number(ch.level || 1) + 1;

    // 1) Update character: level and hp_total
    const { data: charData, error: charErr } = await sb
      .from('characters')
      .update({
        level: nextLevel,
        hp_total: Number(ch.hp_total || 0) + hpGain,
      })
      .eq('id', ch.id)
      .select('id, level, hp_total, hp_current, dmg_t1, dmg_t2, evasion')
      .single();

    if (charErr) {
      console.error('[levelup] character update failed', charErr);
      setText?.('msg', 'Level up failed.');
      return;
    }

    // 2) Optional: bump one ability
    if (statKey) {
      const { data: statsRow, error: statsErr } = await sb
        .from('character_stats')
        .select('*') // tolerant
        .eq('character_id', ch.id)
        .maybeSingle();

      if (
        !statsErr &&
        statsRow &&
        Object.prototype.hasOwnProperty.call(statsRow, statKey)
      ) {
        const cur = Number(statsRow[statKey] || 0);
        const updatePayload = {};
        updatePayload[statKey] = cur + 1;

        const { error: bumpErr } = await sb
          .from('character_stats')
          .update(updatePayload)
          .eq('character_id', ch.id);

        if (bumpErr) console.warn('[levelup] stat bump failed', bumpErr);
      } else if (statsErr) {
        console.warn('[levelup] stats read failed', statsErr);
      }
    }

    // 3) Update local state & repaint core UI
    Object.assign(ch, charData);
    setText?.('charLevelNum', String(ch.level));
    renderHP(ch);

    // 4) Refresh stats UI and recompute evasion in one go (no duplicate recompute)
    if (App.Logic?.evasion?.refreshStatsAndEvasion) {
      await App.Logic.evasion.refreshStatsAndEvasion(sb, ch.id);
    }

    // Feat milestone ping
    const featMsg = ch.level % 6 === 0 ? ' — Feat unlocked (coming soon)!' : '';
    setText?.(
      'msg',
      `Leveled up to ${ch.level}! (+${hpGain} Max HP)${
        statKey ? ` (+1 ${statKey.replace(/_/g, ' ')})` : ''
      }${featMsg}`
    );

    back.classList.remove('show');
  });
}

// /js/features/rests-ui.js
(function (App) {
  const sb = () => window.sb;
  const getCh = () => window.AppState?.character;
  let _restMode = null;

  // ========== Public bootstrap ==========
  function wireRestUI() {
    document.addEventListener('click', onRestClick, true);
  }

  // ========== Event delegation for modal buttons ==========
  async function onRestClick(e) {
    const t = e.target;
    const shortRest = t.closest?.('#btnShortRest');
    const longRest = t.closest?.('#btnLongRest');
    const closeBtn = t.closest?.('#btnCloseRestModal');
    const confirm = t.closest?.('#btnConfirmRest');

    if (!shortRest && !longRest && !closeBtn && !confirm) return;

    e.preventDefault();

    if (shortRest) return openRestModal('short');
    if (longRest) return openRestModal('long');
    if (closeBtn) return closeRestModal();

    if (confirm) {
      if (_restMode === 'short') {
        await applyShortRestOptions();
      } else if (_restMode === 'long') {
        await applyLongRestOptions();
      }
      closeRestModal();
    }
  }

  // ========== Modal open/close ==========
  async function openRestModal(mode) {
    _restMode = mode;
    const title = document.getElementById('restModalTitle');
    if (title)
      title.textContent = mode === 'short' ? 'Short Rest' : 'Long Rest';
    await renderRestOptions(mode);
    document.getElementById('restModalBack')?.classList.add('show');
  }
  function closeRestModal() {
    document.getElementById('restModalBack')?.classList.remove('show');
    _restMode = null;
  }

  // ========== Render options ==========
  async function renderRestOptions(mode) {
    const root = document.getElementById('restOptions');
    const confirmBtn = document.getElementById('btnConfirmRest');
    if (!root) return;

    if (mode === 'short') {
      root.innerHTML = `
        <div class="mono muted rest-msg" style="margin-bottom:6px"></div>
        <label class="row rest-option" data-rest="hp"><input id="srHP"    type="checkbox"/><span>Regain <strong>1d4 HP</strong></span></label>
        <label class="row rest-option" data-rest="armor"><input id="srArmor" type="checkbox"/><span>Repair <strong>1d4 armor slots</strong></span></label>
        <label class="row rest-option" data-rest="hope"><input id="srHope"  type="checkbox"/><span>Gain <strong>+1 Hope</strong> (to max 5)</span></label>
        <label class="row rest-option" data-rest="exo"><input id="srExo"   type="checkbox"/><span>Restore <strong>Exoskin on one slot</strong></span></label>
      `;
      await applyShortRestAvailability();
    } else {
      root.innerHTML = `
        <div class="mono muted rest-msg" style="margin-bottom:6px"></div>
        <label class="row"><input id="lrFullHeal"  type="checkbox"/><span><strong>Tend to all wounds</strong> (HP → max)</span></label>
        <label class="row"><input id="lrRepairAll" type="checkbox"/><span><strong>Repair all equipped armor</strong></span></label>
        <label class="row"><input id="lrHope2"     type="checkbox"/><span><strong>Gain +2 Hope</strong> (to max 5)</span></label>
        <label class="row" style="align-items:flex-start">
          <input id="lrProject" type="checkbox"/>
          <span style="display:inline-block">
            <strong>Work on a project</strong> (+1 tick)<br/>
            <input id="lrProjectName" type="text" placeholder="Project name…" style="margin-top:6px; width:260px"/>
          </span>
        </label>
        <div class="mono muted" style="margin-top:8px">
          Exoskin will be restored on <strong>all 5 armor slots</strong> automatically.
        </div>
      `;
    }

    setupChooseLimit(root, 2, confirmBtn);
  }

  const ARMOR_SLOTS = ['head', 'chest', 'legs', 'hands', 'feet'];

  function greyRestOption(checkbox, unavailable, reason) {
    if (!checkbox) return;
    const label = checkbox.closest('.rest-option');
    if (unavailable) {
      checkbox.checked = false;
      checkbox.disabled = true;
      label?.classList.add('rest-option--unavail');
      if (label) {
        let note = label.querySelector('.rest-unavail-note');
        if (!note) {
          note = document.createElement('span');
          note.className = 'rest-unavail-note muted';
          label.appendChild(note);
        }
        note.textContent = reason;
      }
    } else {
      checkbox.disabled = false;
      label?.classList.remove('rest-option--unavail');
      label?.querySelector('.rest-unavail-note')?.remove();
    }
  }

  async function applyShortRestAvailability() {
    const client = sb();
    const ch = getCh();
    if (!client || !ch?.id) return;

    const hpFull =
      Number(ch.hp_current ?? 0) >= Number(ch.hp_total ?? 0) && Number(ch.hp_total) > 0;
    greyRestOption(document.getElementById('srHP'), hpFull, 'Already at full HP');

    const hopeFull = Number(ch.hope_points ?? 0) >= 5;
    greyRestOption(
      document.getElementById('srHope'),
      hopeFull,
      'Already at max Hope (5)'
    );

    const { data: eqRows = [] } = await client
      .from('character_equipment')
      .select('exo_left, slots_remaining, item_id, item:items(armor_value)')
      .eq('character_id', ch.id)
      .in('slot', ARMOR_SLOTS);

    const canRestoreExo = (eqRows || []).some((r) => Number(r.exo_left ?? 0) === 0);
    greyRestOption(
      document.getElementById('srExo'),
      !canRestoreExo,
      'All clothing layers intact'
    );

    const canRepairArmor = (eqRows || []).some((r) => {
      const max = Number(r.item?.armor_value || 0);
      return r.item_id && max > 0 && Number(r.slots_remaining ?? 0) < max;
    });
    greyRestOption(
      document.getElementById('srArmor'),
      !canRepairArmor,
      'All equipped armor at full protection'
    );
  }

  // ========== Choose limit helper ==========
  function setupChooseLimit(container, maxChoices, confirmBtn) {
    const checks = Array.from(
      container.querySelectorAll('input[type="checkbox"]')
    );
    const msg = container.querySelector('.rest-msg');
    function refresh() {
      const enabled = checks.filter((c) => !c.disabled);
      const chosen = enabled.filter((c) => c.checked);
      if (chosen.length > maxChoices) {
        const last = chosen[chosen.length - 1];
        last.checked = false;
      }
      const count = enabled.filter((c) => c.checked).length;
      const avail = enabled.length;
      if (confirmBtn) {
        confirmBtn.disabled = count === 0 || avail === 0;
        confirmBtn.classList.toggle('disabled', count === 0 || avail === 0);
      }
      if (msg) {
        if (avail === 0) {
          msg.textContent = 'Nothing available to choose — all options already at max.';
        } else if (count === 0) {
          msg.textContent = `Choose up to ${Math.min(maxChoices, avail)}.`;
        } else {
          msg.textContent = `Selected ${count}/${Math.min(maxChoices, avail)}.`;
        }
      }
    }
    checks.forEach((c) => c.addEventListener('change', refresh));
    refresh();
  }

  // ========== Full repaint after rest ==========
  async function refreshAfterRest() {
    const client = window.sb;
    const ch = window.AppState?.character;
    if (!client || !ch?.id) return;

    // refetch character state
    const { data } = await client
      .from('characters')
      .select(
        'id,hp_current,hp_total,hope_points,exoskin_slots_max,exoskin_slots_remaining'
      )
      .eq('id', ch.id)
      .maybeSingle();
    if (data) Object.assign(ch, data);

    // repaint UI
    if (typeof renderHP === 'function') renderHP(ch);
    if (typeof renderHope === 'function') renderHope(ch);
    App.Features?.equipment?.invalidateCache?.();
    await App.Features.equipment.refresh(ch.id);
  }

  // ========== Apply Short Rest ==========
  async function applyShortRestOptions() {
    const client = sb();
    const ch = getCh();
    if (!client || !ch) return;

    const results = await App.Logic.rests.applyShortRest(client, ch, {
      hp1d4: document.getElementById('srHP')?.checked,
      repair1d4: document.getElementById('srArmor')?.checked,
      hopePlus1: document.getElementById('srHope')?.checked,
      exoOne: document.getElementById('srExo')?.checked,
    });

    await refreshAfterRest();
    setText?.('msg', `Short rest: ${results.join(' · ')}`);
  }

  // ========== Apply Long Rest ==========
  async function applyLongRestOptions() {
    const client = sb();
    const ch = getCh();
    if (!client || !ch) return;

    const results = await App.Logic.rests.applyLongRest(client, ch, {
      fullHeal: document.getElementById('lrFullHeal')?.checked,
      repairAll: document.getElementById('lrRepairAll')?.checked,
      hopePlus2: document.getElementById('lrHope2')?.checked,
      projectName: document.getElementById('lrProject')?.checked
        ? document.getElementById('lrProjectName')?.value || ''
        : '',
    });

    await refreshAfterRest();
    setText?.('msg', `Long rest: ${results.join(' · ')}`);
  }

  // ========== Expose ==========
  App.Features = App.Features || {};
  App.Features.restsUI = { wireRestUI };
})(window.App || (window.App = {}));

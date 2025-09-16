// /js/features/rests-ui.js
(function (App) {
  const sb = () => window.sb;
  const getCh = () => window.AppState?.character;
  let _restMode = null;

  // ---- Public wire-up (call once on app init) ----
  function wireRestUI() {
    document.addEventListener('click', onRestClick, true);
  }

  // ---- Event delegation for modal buttons ----
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

  // ---- Modal open/close ----
  function openRestModal(mode) {
    _restMode = mode;
    const title = document.getElementById('restModalTitle');
    if (title)
      title.textContent = mode === 'short' ? 'Short Rest' : 'Long Rest';
    renderRestOptions(mode);
    document.getElementById('restModalBack')?.classList.add('show');
  }
  function closeRestModal() {
    document.getElementById('restModalBack')?.classList.remove('show');
    _restMode = null;
  }

  // ---- Render options + choose-limit (max 2) ----
  async function renderRestOptions(mode) {
    const root = document.getElementById('restOptions');
    const confirmBtn = document.getElementById('btnConfirmRest');
    if (!root) return;

    // Build UI
    if (mode === 'short') {
      root.innerHTML = `
        <div class="mono muted rest-msg" style="margin-bottom:6px"></div>
        <label class="row"><input id="srHP"    type="checkbox"/><span>Regain <strong>1d4 HP</strong></span></label>
        <label class="row"><input id="srArmor" type="checkbox"/><span>Repair <strong>1d4 armor slots</strong> (+1 each, random damaged slots)</span></label>
        <label class="row"><input id="srHope"  type="checkbox"/><span>Gain <strong>+1 Hope</strong> (to max 5)</span></label>
        <label class="row"><input id="srExo"   type="checkbox"/><span>Restore <strong>Exoskin on one slot</strong> (random damaged exo)</span></label>
      `;
    } else {
      root.innerHTML = `
        <div class="mono muted rest-msg" style="margin-bottom:6px"></div>
        <label class="row"><input id="lrFullHeal"  type="checkbox"/><span><strong>Tend to all wounds</strong> (HP → max)</span></label>
        <label class="row"><input id="lrRepairAll" type="checkbox"/><span><strong>Repair all equipped armor</strong> (does not recreate destroyed armor)</span></label>
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

    // limit to 2 choices and enable confirm only when ≥1 selected
    setupChooseLimit(root, 2, confirmBtn);
  }

  // ---- Enforce "pick up to N" & enable confirm ----
  function setupChooseLimit(container, maxChoices, confirmBtn) {
    const checks = Array.from(
      container.querySelectorAll('input[type="checkbox"]')
    );
    const msg = container.querySelector('.rest-msg');
    const refresh = () => {
      const selected = checks.filter((c) => c.checked);
      if (selected.length > maxChoices) {
        // uncheck the one that was just toggled on
        const last = selected[selected.length - 1];
        last.checked = false;
      }
      const count = checks.filter((c) => c.checked).length;
      if (confirmBtn) {
        confirmBtn.disabled = count === 0;
        confirmBtn.classList.toggle('disabled', count === 0);
      }
      if (msg)
        msg.textContent =
          count === 0
            ? `Choose up to ${maxChoices}.`
            : `Selected ${count}/${maxChoices}.`;
    };
    checks.forEach((c) => c.addEventListener('change', refresh));
    refresh();
  }

  // ---- Apply SHORT rest (calls your logic; then repaint UI) ----
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

    // repaint HP/Hope
    setText?.('hpCurrent', ch.hp_current);
    setText?.('hopeDots', fmtDots?.(ch.hope_points) ?? '');

    // armor/exo UI
    await App.Features.equipment.computeAndRenderArmor(ch.id);
    await App.Features.equipment.load(ch.id);

    setText?.('msg', `Short rest: ${results.join(' · ')}`);
  }

  // ---- Apply LONG rest (calls your logic; then repaint UI) ----
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

    // repaint HP/Hope
    setText?.('hpCurrent', ch.hp_current);
    setText?.('hopeDots', fmtDots?.(ch.hope_points) ?? '');

    // armor/exo UI
    await App.Features.equipment.computeAndRenderArmor(ch.id);
    await App.Features.equipment.load(ch.id);

    setText?.('msg', `Long rest: ${results.join(' · ')}`);
  }

  // expose
  App.Features = App.Features || {};
  App.Features.restsUI = { wireRestUI };
})(window.App || (window.App = {}));

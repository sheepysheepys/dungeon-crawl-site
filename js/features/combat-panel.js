// Inline combat panel — damage + stripping without a modal
(function (global) {
  const App = (global.App = global.App || { Features: {} });

  function thresholds(ch) {
    const t1 = Number.isFinite(Number(ch?.dmg_t1)) ? Number(ch.dmg_t1) : 7;
    const t2Raw = Number.isFinite(Number(ch?.dmg_t2)) ? Number(ch.dmg_t2) : 14;
    const t2 = Math.max(t1 + 1, t2Raw);
    return { t1, t2, brutal: t2 + 1 };
  }

  function setHitResult(text) {
    global.setText?.('hitResult', text || '');
    const el = document.getElementById('hitResult');
    if (el) el.classList.toggle('hit-result--active', !!text);
  }

  function setStripFlavor(text) {
    const el = document.getElementById('stripFlavor');
    if (!el) return;
    const msg = text || '';
    el.textContent = msg;
    el.hidden = !msg;
    el.classList.toggle('strip-flavor--active', !!msg);
  }

  async function applyDamageAmount(rawAmount) {
    const sb = global.sb;
    const ch = global.AppState?.character;
    if (!sb || !ch?.id) return null;

    let amount = Math.max(0, Number(rawAmount) || 0);
    if (amount <= 0) {
      setHitResult('Enter damage greater than 0.');
      setStripFlavor('');
      return null;
    }

    global.AppState = global.AppState || {};
    const opts = {};

    if (global.AppState.hopeHalveNextHit) {
      amount = Math.max(1, Math.ceil(amount / 2));
      global.AppState.hopeHalveNextHit = false;
      opts._halved = true;
    }

    if (global.AppState.hopeStripCounter) {
      opts.skipStrip = true;
      global.AppState.hopeStripCounter = false;
      opts._stripCounter = true;
    }

    try {
      const out = await App.Logic?.combat?.applyHit?.(sb, ch, amount, opts);
      if (!out) return null;

      renderHP?.(ch);

      const layersLost = out.strip?.exoHits || 0;
      const armorHits = out.strip?.armorHits || 0;
      let stripQuip = '';

      if (out.knockedDown) {
        stripQuip =
          App.Features?.flavor?.stripQuip?.({ knockedDown: true }) ||
          'Knocked down — all clothing stripped (0/5).';
        global.setText?.('msg', '');
      } else {
        global.setText?.('msg', '');
        if (layersLost > 0) {
          stripQuip =
            App.Features?.flavor?.stripQuip?.({ stripHits: layersLost }) || '';
        }
      }

      setStripFlavor(stripQuip);

      if (!out.knockedDown) {
        App.Features?.equipment?.invalidateCache?.();
        await App.Features?.equipment?.refresh?.(ch.id);
      }

      const parts = [`−${out.hpLoss} HP`];
      if (out.armorBlocked) parts.push('armor blocked −1');
      if (layersLost) {
        parts.push(
          `${layersLost} layer${layersLost === 1 ? '' : 's'} lost`
        );
      }
      if (armorHits) {
        parts.push(
          `${armorHits} armor hit${armorHits === 1 ? '' : 's'}`
        );
      }
      if (opts._halved) parts.push('halved');
      if (opts._stripCounter) parts.push('strip counter');

      const damageQuip = App.Features?.flavor?.damageQuip?.({
        hpLoss: out.hpLoss,
      });
      const line = damageQuip
        ? `${damageQuip} · Hit for ${amount}: ${parts.join(' · ')}`
        : `Hit for ${amount}: ${parts.join(' · ')}`;
      setHitResult(line);
      const el = document.getElementById('hitResult');
      if (el) el.classList.toggle('hit-result--flavor', !!damageQuip);

      return out;
    } catch (e) {
      console.error('[combat-panel] apply failed', e);
      setHitResult('Could not apply hit.');
      setStripFlavor('');
      return null;
    }
  }

  function wireCombatPanel() {
    if (wireCombatPanel._wired) return;
    wireCombatPanel._wired = true;
    const input = document.getElementById('hitDamage');
    const applyBtn = document.getElementById('btnApplyHit');
    const healBtn = document.getElementById('btnHealHp');

    applyBtn?.addEventListener('click', () => {
      applyDamageAmount(input?.value || 0);
    });

    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyDamageAmount(input.value);
      }
    });

    healBtn?.addEventListener('click', () => global.adjustHP?.(+1));
  }

  App.Features.combatPanel = {
    wire: wireCombatPanel,
    applyDamageAmount,
    thresholds,
  };
})(window);

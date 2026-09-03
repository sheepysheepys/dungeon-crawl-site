// Hope spending — visible at the table, deducts hope, wires what we can automate
(function (global) {
  const App = (global.App = global.App || { Features: {} });

  const SPENDS = [
    {
      id: 'reroll',
      cost: 1,
      label: 'Re-roll check, save, or attack',
      hint: 'Tell the table before rolling again.',
    },
    {
      id: 'halve',
      cost: 1,
      label: 'Halve incoming damage (next hit)',
      hint: 'Auto-applies on your next Take Hit.',
      effect: 'halveNextHit',
    },
    {
      id: 'advantage',
      cost: 2,
      label: 'Advantage (declare before roll)',
      hint: 'Call it before you roll.',
    },
    {
      id: 'strip-counter',
      cost: 3,
      label: 'Strip counter (next hit)',
      hint: 'Next hit: HP only, no clothing strip.',
      effect: 'stripCounter',
    },
    {
      id: 'article',
      cost: 3,
      label: 'Gain 1 clothing layer back',
      hint: 'Restores one exo slot.',
      effect: 'restoreExo',
    },
    {
      id: 'gift-funish',
      cost: 4,
      label: 'Gift funishment to someone',
      hint: 'Pick who — DM adjudicates.',
    },
    {
      id: 'share-funish',
      cost: 4,
      label: 'Share funishment with someone',
      hint: 'You both participate — DM adjudicates.',
    },
    {
      id: 'pick-strip',
      cost: 4,
      label: 'Pick someone to strip a layer',
      hint: 'Choose target — DM adjudicates.',
    },
    {
      id: 'miracle',
      cost: 5,
      label: 'Hope miracle — tweak the story',
      hint: 'Small real-time change — DM has final say.',
    },
  ];

  function currentHope() {
    return Math.max(0, Math.min(5, Number(global.AppState?.character?.hope_points ?? 0)));
  }

  async function spendHope(cost) {
    const sb = global.sb;
    const ch = global.AppState?.character;
    if (!sb || !ch?.id) return false;

    const cur = currentHope();
    if (cur < cost) {
      global.setText?.('msg', `Not enough Hope (need ${cost}, have ${cur}).`);
      return false;
    }

    const next = cur - cost;
    const { data, error } = await sb
      .from('characters')
      .update({ hope_points: next })
      .eq('id', ch.id)
      .select('hope_points')
      .single();

    if (error) {
      global.setText?.('msg', 'Hope spend failed.');
      return false;
    }

    ch.hope_points = data.hope_points;
    global.renderHope?.(ch);
    return true;
  }

  async function applyEffect(effect) {
    const sb = global.sb;
    const ch = global.AppState?.character;
    if (!sb || !ch?.id) return null;

    global.AppState = global.AppState || {};

    if (effect === 'halveNextHit') {
      global.AppState.hopeHalveNextHit = true;
      return 'Next hit damage will be halved.';
    }

    if (effect === 'stripCounter') {
      global.AppState.hopeStripCounter = true;
      return 'Next hit will not strip clothing.';
    }

    if (effect === 'restoreExo') {
      const slot = await App.Logic?.rests?.restoreOneExo?.(sb, ch.id);
      if (!slot) return 'Clothing already full (5/5).';

      const curExo = Math.min(5, Number(ch.exoskin_slots_remaining || 0) + 1);
      await sb
        .from('characters')
        .update({ exoskin_slots_remaining: curExo })
        .eq('id', ch.id);
      ch.exoskin_slots_remaining = curExo;

      App.Features?.equipment?.invalidateCache?.();
      await App.Features?.equipment?.refresh?.(ch.id);
      return `Clothing restored on ${slot}.`;
    }

    return null;
  }

  function renderHopeShop() {
    const root = document.getElementById('hopeSpendList');
    if (!root) return;

    const hope = currentHope();
    root.innerHTML = SPENDS.map((s) => {
      const disabled = hope < s.cost;
      return `
        <button type="button" class="hope-spend-btn${disabled ? ' hope-spend-btn--disabled' : ''}"
          data-hope-spend="${s.id}" data-hope-cost="${s.cost}"
          ${disabled ? 'disabled' : ''} title="${s.hint.replace(/"/g, '&quot;')}">
          <span class="hope-spend-label">${s.label}</span>
          <span class="hope-spend-cost">${s.cost} Hope</span>
        </button>`;
    }).join('');

    root.querySelectorAll('[data-hope-spend]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-hope-spend');
        const item = SPENDS.find((s) => s.id === id);
        if (!item) return;

        const ok = await spendHope(item.cost);
        if (!ok) return;

        let msg = `Spent ${item.cost} Hope: ${item.label}.`;
        if (item.effect) {
          const effectMsg = await applyEffect(item.effect);
          if (effectMsg) msg += ` ${effectMsg}`;
        } else {
          msg += ` ${item.hint}`;
        }

        global.setText?.('msg', msg);
      });
    });
  }

  function wireHopeShop() {
    if (wireHopeShop._wired) return;
    wireHopeShop._wired = true;
    const origRenderHope = global.renderHope;
    if (origRenderHope && !global.renderHope.__hopeShopWrapped) {
      global.renderHope = function (ch) {
        origRenderHope(ch);
        renderHopeShop();
      };
      global.renderHope.__hopeShopWrapped = true;
    }

    renderHopeShop();
  }

  App.Features.hopeShop = { wire: wireHopeShop, render: renderHopeShop, SPENDS };
})(window);

// /js/logic/combat.js
(function (App) {
  const ARMOR_SLOTS = ['head', 'chest', 'legs', 'hands', 'feet'];

  // ---- thresholds loader (two-number model) ----
  async function loadThresholds(sb, chId) {
    const { data } = await sb
      .from('characters')
      .select('hp_current,hp_total,dmg_t1,dmg_t2,dmg_minor,dmg_major')
      .eq('id', chId)
      .maybeSingle();

    const t1 = Number(data?.dmg_t1 ?? data?.dmg_minor ?? 7);
    const t2 = Number(data?.dmg_t2 ?? data?.dmg_major ?? 14);
    return {
      hp_current: Number(data?.hp_current ?? 0),
      hp_total: Number(data?.hp_total ?? 0),
      t1: Math.max(1, Math.min(t1, t2)), // clamp sane
      t2: Math.max(1, t2),
    };
  }

  // ---- armor fetch ----
  async function fetchArmorRows(sb, chId) {
    const { data, error } = await sb
      .from('character_equipment')
      .select(
        'id, slot, item_id, slots_remaining, exo_left, item:items(armor_value)'
      )
      .eq('character_id', chId)
      .in('slot', ARMOR_SLOTS);

    if (error) {
      console.warn('[combat] armor fetch error', error);
      return [];
    }
    return data || [];
  }

  // ---- simulate armor absorption (no writes) ----
  function simulateArmorAbsorb(rows, incoming) {
    // Work on a local copy
    const state = rows.map((r) => ({
      id: r.id,
      slot: r.slot,
      item_id: r.item_id,
      max: Number(r?.item?.armor_value ?? 0),
      seg: Math.max(0, Number(r?.slots_remaining ?? 0)),
      exo: Math.max(0, Number(r?.exo_left ?? 0)) > 0 ? 1 : 0,
    }));

    let dmg = Math.max(0, Number(incoming || 0));
    let absorbedSegments = 0;
    let consumedExo = 0;

    // Greedy: consume armor segments first (most remaining), then exo pips
    while (dmg > 0) {
      // find row with any segments left
      let i = state.reduce((bestIdx, r, idx, arr) => {
        if (r.seg > 0) {
          if (bestIdx === -1) return idx;
          return arr[bestIdx].seg >= r.seg ? bestIdx : idx; // pick most segments
        }
        return bestIdx;
      }, -1);

      if (i !== -1) {
        state[i].seg -= 1;
        absorbedSegments += 1;
        dmg -= 1;
        continue;
      }

      // else consume one exo if any remains
      i = state.findIndex((r) => r.exo > 0);
      if (i !== -1) {
        state[i].exo = 0;
        consumedExo += 1;
        dmg -= 1;
        continue;
      }

      // no armor left to absorb
      break;
    }

    const residual = Math.max(0, dmg);

    return {
      residual,
      absorbedSegments,
      consumedExo,
      next: state, // post-sim state
    };
  }

  // ---- HP loss from residual via thresholds (two-number model) ----
  function hpLossFromResidual(residual, t1, t2) {
    const r = Math.max(0, Number(residual || 0));
    if (r === 0) return 0;
    if (r <= t1) return 1;
    if (r <= t2) return 2;
    return 3;
  }

  // ---- apply write: persist armor + hp ----
  async function persistArmorAndHP(sb, ch, sim, hpLoss) {
    // batch armor updates
    for (const r of sim.next) {
      // Only write rows that actually changed
      const orig = { seg: undefined, exo: undefined };
      // We don’t have original seg/exo now; rely on sum of deltas from absorbed counts:
      // safer: write both fields for any row that differs from current DB-ish shape we received
      // But since simulate used current rows, if consumed any, at least one changed.
      // So: issue updates only where seg/exo changed relative to original input we had in `rows`.
      // To enable that, sim includes original rows on .orig if needed. Keeping it simple:
    }

    // Easier: compute per-row deltas during simulate; but we kept only "next".
    // We'll just update all armor rows we touched (those where seg/exo changed from their "next" is different than max/0 baseline inference).
    // Pragmatic approach: write all rows from sim.next; Postgres will no-op identical values.
    for (const r of sim.next) {
      await sb
        .from('character_equipment')
        .update({ slots_remaining: r.seg, exo_left: r.exo })
        .eq('id', r.id);
    }

    // Update HP
    if (hpLoss > 0) {
      const nextHP = Math.max(0, Number(ch.hp_current || 0) - hpLoss);
      await sb
        .from('characters')
        .update({ hp_current: nextHP })
        .eq('id', ch.id);
      ch.hp_current = nextHP; // in-memory
    }

    return true;
  }

  // ---- public: preview (no writes) ----
  async function previewHit(sb, chId, amount) {
    const { t1, t2 } = await loadThresholds(sb, chId);
    const rows = await fetchArmorRows(sb, chId);
    const sim = simulateArmorAbsorb(rows, amount);
    const hpLoss = hpLossFromResidual(sim.residual, t1, t2);
    return {
      amount: Number(amount || 0),
      thresholds: { t1, t2 },
      absorbed: { segments: sim.absorbedSegments, exo: sim.consumedExo },
      residual: sim.residual,
      hpLoss,
    };
  }

  // ---- public: apply (writes armor + hp) ----
  async function applyHit(sb, ch, amount) {
    const { t1, t2 } = await loadThresholds(sb, ch.id);
    const rows = await fetchArmorRows(sb, ch.id);

    // ensure five exo rows exist (just in case)
    if (!rows?.length) {
      if (App?.Features?.equipment?.ensureExoRowsForAllSlots) {
        await App.Features.equipment.ensureExoRowsForAllSlots(ch.id);
      }
    }
    const sim = simulateArmorAbsorb(rows, amount);
    const hpLoss = hpLossFromResidual(sim.residual, t1, t2);

    await persistArmorAndHP(sb, ch, sim, hpLoss);

    return {
      summary: `Armor absorbed ${sim.absorbedSegments}+${sim.consumedExo} (segments+exo); residual ${sim.residual}; HP -${hpLoss}`,
      hpLoss,
      absorbedSegments: sim.absorbedSegments,
      consumedExo: sim.consumedExo,
      residual: sim.residual,
    };
  }

  App.Logic = App.Logic || {};
  App.Logic.combat = { previewHit, applyHit, hpLossFromResidual };
})(window.App || (window.App = {}));

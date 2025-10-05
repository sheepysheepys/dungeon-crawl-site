// /js/logic/combat.js
(function (App) {
  const ARMOR_SLOTS = ['head', 'chest', 'legs', 'hands', 'feet'];

  // -------- thresholds --------
  async function loadThresholds(sb, chId) {
    const { data } = await sb
      .from('characters')
      .select('hp_current,hp_total,dmg_t1,dmg_t2,dmg_minor,dmg_major')
      .eq('id', chId)
      .maybeSingle();
    return {
      hp_current: Number(data?.hp_current ?? 0),
      hp_total: Number(data?.hp_total ?? 0),
      t1: Number(data?.dmg_t1 ?? data?.dmg_minor ?? 7),
      t2: Number(data?.dmg_t2 ?? data?.dmg_major ?? 14),
    };
  }

  function hpLossFromDamage(amount, t1, t2) {
    const r = Math.max(0, Number(amount || 0));
    if (r === 0) return 0;
    if (r <= t1) return 1;
    if (r <= t2) return 2;
    return 3;
  }

  // -------- armor data helpers --------
  async function fetchArmorRows(sb, chId) {
    const { data } = await sb
      .from('character_equipment')
      .select(
        'id,slot,item_id,slots_remaining,exo_left,item:items(armor_value,name)'
      )
      .eq('character_id', chId)
      .in('slot', ARMOR_SLOTS);
    return data || [];
  }

  async function ensureExoRows(sb, chId) {
    const rows = await fetchArmorRows(sb, chId);
    const have = new Set(rows.map((r) => r.slot));
    const missing = ARMOR_SLOTS.filter((s) => !have.has(s));
    if (missing.length) {
      const inserts = missing.map((slot) => ({
        character_id: chId,
        slot,
        item_id: null,
        slots_remaining: 0,
        exo_left: 1,
      }));
      await sb.from('character_equipment').insert(inserts);
    }
  }

  // -------- target selection used by both preview/apply --------
  function pickRandomSlotWithExo(rows) {
    const candidates = rows.filter((r) => Number(r?.exo_left || 0) > 0);
    if (!candidates.length) return null;
    const i = Math.floor(Math.random() * candidates.length);
    return candidates[i].slot;
  }

  /**
   * Decide what this hit *would* strike:
   * - if no exo anywhere → 'none'
   * - pick a random exo slot; if that slot has armor segments > 0 → 'armor', else 'exo'
   */
  function decideStripOutcome(rows) {
    const slot = pickRandomSlotWithExo(rows);
    if (!slot) return { type: 'none', slot: null, row: null };

    const row = rows.find((r) => r.slot === slot);
    const hasArmorSeg = Number(row?.slots_remaining || 0) > 0;
    return { type: hasArmorSeg ? 'armor' : 'exo', slot, row };
  }

  /**
   * Commit the strip outcome chosen above to DB.
   * - If 'armor': decrement slots_remaining by 1
   * - If 'exo'  : set exo_left = 0
   * - If 'none' : no-op
   */
  async function applyChosenStrip(sb, outcome) {
    if (!outcome || !outcome.row) return { type: 'none', slot: null };
    if (outcome.type === 'armor') {
      const next = Math.max(0, Number(outcome.row.slots_remaining || 0) - 1);
      await sb
        .from('character_equipment')
        .update({ slots_remaining: next })
        .eq('id', outcome.row.id);
      return { type: 'armor', slot: outcome.slot, newValue: next };
    }
    if (outcome.type === 'exo') {
      await sb
        .from('character_equipment')
        .update({ exo_left: 0 })
        .eq('id', outcome.row.id);
      return { type: 'exo', slot: outcome.slot, newValue: 0 };
    }
    return { type: 'none', slot: null };
  }

  // -------- PREVIEW (includes conditional mitigation) --------
  async function previewHit(sb, chId, amount) {
    await ensureExoRows(sb, chId);
    const rows = await fetchArmorRows(sb, chId);

    const outcome = decideStripOutcome(rows);
    // Mitigate by 1 ONLY if this hit would strike an ARMOR segment
    const mitigated =
      outcome.type === 'armor'
        ? Math.max(0, Number(amount || 0) - 1)
        : Math.max(0, Number(amount || 0));

    const { t1, t2 } = await loadThresholds(sb, chId);
    const hpLoss = hpLossFromDamage(mitigated, t1, t2);

    return {
      amount: Number(amount || 0),
      mitigated,
      thresholds: { t1, t2 },
      hpLoss,
      strip:
        outcome.type === 'none' ? 'none' : `${outcome.type} (${outcome.slot})`,
    };
  }

  // -------- APPLY (commit same outcome; HP uses mitigated) --------
  async function applyHit(sb, ch, amount) {
    await ensureExoRows(sb, ch.id);
    const rows = await fetchArmorRows(sb, ch.id);

    // Decide target first and stick to it
    const outcome = decideStripOutcome(rows);

    // Apply mitigation only if outcome is 'armor'
    const mitigated =
      outcome.type === 'armor'
        ? Math.max(0, Number(amount || 0) - 1)
        : Math.max(0, Number(amount || 0));

    // Compute HP loss from mitigated value
    const { t1, t2 } = await loadThresholds(sb, ch.id);
    const hpLoss = hpLossFromDamage(mitigated, t1, t2);

    if (hpLoss > 0) {
      const nextHP = Math.max(0, Number(ch.hp_current || 0) - hpLoss);
      await sb
        .from('characters')
        .update({ hp_current: nextHP })
        .eq('id', ch.id);
      ch.hp_current = nextHP; // keep local in sync
    }

    // Commit the exact strip outcome we decided earlier
    const strip = await applyChosenStrip(sb, outcome);

    return {
      summary: `Hit ${amount} → ${
        outcome.type === 'armor'
          ? 'mitigated ' + mitigated
          : 'no mitigation (' + mitigated + ')'
      } → HP -${hpLoss}; strip: ${strip.type}${
        strip.slot ? ' (' + strip.slot + ')' : ''
      }`,
      mitigated,
      hpLoss,
      strip,
    };
  }

  App.Logic = App.Logic || {};
  App.Logic.combat = { previewHit, applyHit, hpLossFromDamage };
})(window.App || (window.App = {}));

// /js/logic/combat.js
(function (App) {
  const ARMOR_SLOTS = ['head', 'chest', 'legs', 'hands', 'feet'];

  // -------- thresholds (two-number model) --------
  async function loadThresholds(sb, chId) {
    const { data } = await sb
      .from('characters')
      .select('hp_current,hp_total,dmg_t1,dmg_t2,dmg_minor,dmg_major')
      .eq('id', chId)
      .maybeSingle();
    return {
      hp_current: Number(data?.hp_current ?? 0),
      hp_total: Number(data?.hp_total ?? 0),
      // fallback to old columns if new ones not present
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

  // -------- armor helpers --------
  async function fetchArmorRows(sb, chId) {
    const { data } = await sb
      .from('character_equipment')
      .select(
        'id, slot, item_id, slots_remaining, exo_left, item:items(armor_value)'
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

  // pick a target ONLY among slots that still have exoskin
  function pickRandomSlotWithExo(rows) {
    const candidates = rows.filter((r) => Number(r?.exo_left || 0) > 0);
    if (!candidates.length) return null;
    const i = Math.floor(Math.random() * candidates.length);
    return candidates[i].slot;
  }

  // -------- STRIP STEP: random slot WITH EXO; armor first, else exo --------
  async function applyStripStepRandom(sb, chId) {
    await ensureExoRows(sb, chId);
    const rows = await fetchArmorRows(sb, chId);

    const targetSlot = pickRandomSlotWithExo(rows);
    if (!targetSlot) {
      // No exo anywhere => no strip this hit
      return { type: 'none', slot: null };
    }

    const row = rows.find((r) => r.slot === targetSlot);
    const seg = Math.max(0, Number(row?.slots_remaining || 0));
    const exo = Number(row?.exo_left || 0) > 0 ? 1 : 0;

    if (seg > 0) {
      const next = seg - 1;
      await sb
        .from('character_equipment')
        .update({ slots_remaining: next })
        .eq('id', row.id);
      return { type: 'armor', slot: targetSlot, newValue: next };
    }

    // seg==0 but exo==1 → strip exo in that slot
    await sb
      .from('character_equipment')
      .update({ exo_left: 0 })
      .eq('id', row.id);
    return { type: 'exo', slot: targetSlot, newValue: 0 };
  }

  // -------- PREVIEW (no writes except reads) --------
  async function previewHit(sb, chId, amount) {
    const { t1, t2 } = await loadThresholds(sb, chId);
    const hpLoss = hpLossFromDamage(amount, t1, t2);

    await ensureExoRows(sb, chId);
    const rows = await fetchArmorRows(sb, chId);

    const slot = pickRandomSlotWithExo(rows);
    let strip;
    if (!slot) {
      strip = 'none';
    } else {
      const r = rows.find((x) => x.slot === slot);
      strip =
        Number(r?.slots_remaining || 0) > 0
          ? `armor (${slot})`
          : `exo (${slot})`;
    }

    return {
      amount: Number(amount || 0),
      thresholds: { t1, t2 },
      hpLoss,
      strip,
    };
  }

  // -------- APPLY (writes): thresholds HP + one random-slot strip --------
  async function applyHit(sb, ch, amount) {
    const { t1, t2 } = await loadThresholds(sb, ch.id);
    const hpLoss = hpLossFromDamage(amount, t1, t2);

    if (hpLoss > 0) {
      const nextHP = Math.max(0, Number(ch.hp_current || 0) - hpLoss);
      await sb
        .from('characters')
        .update({ hp_current: nextHP })
        .eq('id', ch.id);
      ch.hp_current = nextHP; // keep in-memory in sync
    }

    const strip = await applyStripStepRandom(sb, ch.id);

    return {
      summary: `Hit ${amount} → HP -${hpLoss}; strip: ${strip.type}${
        strip.slot ? ' (' + strip.slot + ')' : ''
      }`,
      hpLoss,
      strip,
    };
  }

  App.Logic = App.Logic || {};
  App.Logic.combat = { previewHit, applyHit, hpLossFromDamage };
})(window.App || (window.App = {}));

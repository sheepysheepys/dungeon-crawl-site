// /js/logic/combat.js
(function (App) {
  const ARMOR_SLOTS = ['head', 'chest', 'legs', 'hands', 'feet'];

  // Strip hits: light 1, heavy 1, brutal 2 (HP loss tiers stay separate).
  function stripHitsFromDamage(amount, t1, t2) {
    const r = Math.max(0, Number(amount || 0));
    if (r === 0) return 0;
    if (r <= t1) return 1;
    if (r <= t2) return 1;
    return 2;
  }

  // -------- thresholds --------
  async function loadThresholds(sb, chId) {
    const { data } = await sb
      .from('characters')
      .select('hp_current,hp_total,dmg_t1,dmg_t2')
      .eq('id', chId)
      .maybeSingle();
    return {
      hp_current: Number(data?.hp_current ?? 0),
      hp_total: Number(data?.hp_total ?? 0),
      t1: Number.isFinite(Number(data?.dmg_t1)) ? Number(data.dmg_t1) : 7,
      t2: Number.isFinite(Number(data?.dmg_t2)) ? Number(data.dmg_t2) : 14,
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

  function eligibleStripRows(rows) {
    return (rows || []).filter(
      (r) =>
        !r._deleted &&
        (Number(r.slots_remaining || 0) > 0 || Number(r.exo_left || 0) > 0)
    );
  }

  /** Slots with equipped armor that still has segments left. */
  function armoredSlots(rows) {
    return (rows || []).filter(
      (r) =>
        r.item_id && Number(r.slots_remaining || 0) > 0
    );
  }

  const ARMOR_BLOCK_CHANCE = 0.5;

  /** 50% chance to block 1 damage if any equipped armor has segments left. */
  function rollArmorBlock(rows) {
    const armored = armoredSlots(rows);
    if (!armored.length) {
      return { blocked: false, slot: null };
    }
    if (Math.random() >= ARMOR_BLOCK_CHANCE) {
      return { blocked: false, slot: null };
    }
    const pick = armored[Math.floor(Math.random() * armored.length)];
    return { blocked: true, slot: pick?.slot || null };
  }

  function pickRandomStripTarget(rows) {
    const elig = eligibleStripRows(rows);
    if (!elig.length) return null;
    return elig[Math.floor(Math.random() * elig.length)];
  }

  function mitigationFor(amount, blocked) {
    return blocked ? Math.max(0, Number(amount || 0) - 1) : Math.max(0, Number(amount || 0));
  }

  /**
   * Spend one strip hit on a slot (armor first, then exo).
   * Returns 'armor' | 'exo' | false.
   */
  async function spendOneStripHit(sb, target, log) {
    if (!target || target._deleted) return false;

    let armorLeft = Math.max(0, Number(target.slots_remaining || 0));
    let exoLeft = Math.max(0, Number(target.exo_left || 0));
    const tag = (target.slot || '—').toUpperCase();

    if (armorLeft > 0) {
      armorLeft -= 1;
      await sb
        .from('character_equipment')
        .update({ slots_remaining: armorLeft })
        .eq('id', target.id);
      target.slots_remaining = armorLeft;
      log.push(`${tag}: armor -1`);
      return 'armor';
    }

    if (exoLeft > 0) {
      await sb
        .from('character_equipment')
        .update({ exo_left: 0 })
        .eq('id', target.id);
      target.exo_left = 0;
      log.push(`${tag}: exo -1`);
      return 'exo';
    }

    return false;
  }

  /**
   * Apply multiple strip hits — drill the first slot, then spill to one other.
   */
  async function applyStripHits(sb, rows, hits) {
    const log = [];
    let exoHits = 0;
    let armorHits = 0;
    let remaining = Math.max(0, Number(hits) || 0);
    if (!remaining) return { hits: 0, exoHits: 0, armorHits: 0, log: [] };

    let current = pickRandomStripTarget(rows);
    let movedOnce = false;

    while (remaining > 0) {
      if (!current) break;

      const spent = await spendOneStripHit(sb, current, log);
      if (!spent) {
        if (movedOnce) break;
        current = pickRandomStripTarget(
          rows.filter((r) => r.id !== current?.id)
        );
        movedOnce = true;
        continue;
      }

      if (spent === 'exo') exoHits += 1;
      if (spent === 'armor') armorHits += 1;

      remaining -= 1;

      const hasCapacity =
        Number(current.slots_remaining || 0) > 0 ||
        Number(current.exo_left || 0) > 0;

      if (!hasCapacity && remaining > 0 && !movedOnce) {
        current = pickRandomStripTarget(rows.filter((r) => r.id !== current.id));
        movedOnce = true;
      }
    }

    return { hits: log.length, exoHits, armorHits, log };
  }

  // -------- APPLY (commit strips scaled to severity; HP uses mitigated) --------
  async function applyHit(sb, ch, amount, opts = {}) {
    await ensureExoRows(sb, ch.id);
    const rows = await fetchArmorRows(sb, ch.id);

    const block = rollArmorBlock(rows);
    const raw = Math.max(0, Number(amount || 0));
    const mitigated = mitigationFor(raw, block.blocked);

    const { t1, t2 } = await loadThresholds(sb, ch.id);
    const hpLoss = hpLossFromDamage(mitigated, t1, t2);
    const stripHits = stripHitsFromDamage(mitigated, t1, t2);

    let knockdownResult = { stripped: false };
    if (hpLoss > 0) {
      const prevHP = Math.max(0, Number(ch.hp_current || 0));
      const nextHP = Math.max(0, prevHP - hpLoss);
      await sb
        .from('characters')
        .update({ hp_current: nextHP })
        .eq('id', ch.id);
      ch.hp_current = nextHP;

      knockdownResult =
        (await App.Logic?.strip?.onHpChanged?.(sb, ch.id, prevHP, nextHP)) ||
        knockdownResult;
    }

    let stripResult = { hits: 0, exoHits: 0, armorHits: 0, log: [] };
    if (!knockdownResult.stripped && stripHits > 0 && !opts.skipStrip) {
      stripResult = await applyStripHits(sb, rows, stripHits);

      if (stripResult.exoHits > 0) {
        const curExo = Math.max(
          0,
          Number(ch.exoskin_slots_remaining ?? 0) - stripResult.exoHits
        );
        await sb
          .from('characters')
          .update({ exoskin_slots_remaining: curExo })
          .eq('id', ch.id);
        ch.exoskin_slots_remaining = curExo;
      }
    }

    const blockNote = block.blocked
      ? `armor blocked −1 (${block.slot || '?'})`
      : armoredSlots(rows).length
        ? 'armor did not block'
        : 'no armor';

    return {
      summary: `Hit ${raw} → ${blockNote} → effective ${mitigated} → HP -${hpLoss}; strips: ${stripResult.hits}${
        stripResult.log.length ? ` (${stripResult.log.join(' · ')})` : ''
      }`,
      mitigated,
      armorBlocked: block.blocked,
      armorBlockSlot: block.slot,
      hpLoss,
      stripHits,
      strip: stripResult,
      knockedDown: !!knockdownResult.stripped,
    };
  }

  App.Logic = App.Logic || {};
  App.Logic.combat = {
    applyHit,
    hpLossFromDamage,
    stripHitsFromDamage,
    armoredSlots,
    rollArmorBlock,
    ARMOR_BLOCK_CHANCE,
  };
})(window.App || (window.App = {}));

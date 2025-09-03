// /js/logic/strip.js
(function (App) {
  App.Logic = App.Logic || {};
  const CFG = (App.Config = App.Config || {});

  // ------- CONFIG -------
  // How many armor "hits" and HP "hits" each severity produces
  CFG.stripPoints = CFG.stripPoints || { minor: 1, major: 2, severe: 3 };
  CFG.hpPoints = CFG.hpPoints || { minor: 1, major: 2, severe: 3 };

  // 'threshold' = use hpPoints per severity; 'raw' = subtract raw damage from HP
  CFG.hpDamageMode = CFG.hpDamageMode || 'threshold';

  const ARMOR_SLOTS = ['head', 'chest', 'legs', 'hands', 'feet'];

  // ------- HELPERS -------
  function getSeverity(dmg, ch) {
    const mi = Number(ch.dmg_minor ?? 0);
    const ma = Number(ch.dmg_major ?? 0);
    const se = Number(ch.dmg_severe ?? 0);
    if (dmg >= se) return 'Severe';
    if (dmg >= ma) return 'Major';
    if (dmg >= mi) return 'Minor';
    return 'None';
  }

  function pointsFor(dmg, ch) {
    const sev = getSeverity(dmg, ch);
    const m = CFG.stripPoints;
    return sev === 'Severe'
      ? m.severe || 0
      : sev === 'Major'
      ? m.major || 0
      : sev === 'Minor'
      ? m.minor || 0
      : 0;
  }

  function hpLossFor(dmg, ch) {
    if (CFG.hpDamageMode === 'raw') {
      return Math.max(0, Math.floor(Number(dmg) || 0));
    }
    const sev = getSeverity(dmg, ch);
    const m = CFG.hpPoints;
    return sev === 'Severe'
      ? m.severe || 0
      : sev === 'Major'
      ? m.major || 0
      : sev === 'Minor'
      ? m.minor || 0
      : 0;
  }

  // Spend as many hits as possible on a single target slot (armor -> exo)
  async function spendHitsOnSlot(sb, target, hits, logArr) {
    let remaining = hits;
    let armorLeft = Math.max(0, Number(target.slots_remaining || 0));
    let exoLeft = Math.max(0, Number(target.exo_left || 0));
    let usedArmor = 0;
    let usedExo = 0;

    // 1) Armor first
    if (remaining > 0 && armorLeft > 0) {
      const use = Math.min(remaining, armorLeft);
      armorLeft -= use;
      remaining -= use;
      usedArmor = use;

      await sb
        .from('character_equipment')
        .update({ slots_remaining: armorLeft })
        .eq('id', target.id);

      // Armor gone -> break the piece (keep ability; convert to exo-only if exo remains)
      if (armorLeft === 0 && target.item_id) {
        await sb
          .from('character_equipment')
          .update({ item_id: null })
          .eq('id', target.id);
        target.item_id = null;
      }
    }

    // 2) Then exo (max 1)
    if (remaining > 0 && exoLeft > 0) {
      exoLeft -= 1;
      remaining -= 1;
      usedExo = 1;

      await sb
        .from('character_equipment')
        .update({ exo_left: exoLeft })
        .eq('id', target.id);
    }

    // 3) If both zero and no item remains, delete the row (fully stripped slot)
    if (armorLeft === 0 && exoLeft === 0 && !target.item_id) {
      await sb.from('character_equipment').delete().eq('id', target.id);
      target._deleted = true;
    } else {
      // keep in-memory state current
      target.slots_remaining = armorLeft;
      target.exo_left = exoLeft;
    }

    if (usedArmor || usedExo) {
      const tag = (target.slot || '—').toUpperCase();
      const parts = [];
      if (usedArmor) parts.push(`armor -${usedArmor}`);
      if (usedExo) parts.push('exo -1');
      logArr.push(`${tag}: ${parts.join(', ')}`);
    }

    return remaining;
  }

  // Main entry called from the calculator Apply button
  async function applyHitFromCalc(
    dmg,
    { adjustHP, setText, sb, AppState, afterUpdate }
  ) {
    const ch = AppState.character;
    if (!sb || !ch) return;

    const sev = getSeverity(dmg, ch);
    const hits = pointsFor(dmg, ch); // armor hits to spend
    const hpLoss = hpLossFor(dmg, ch); // hp to subtract

    // HP first (using thresholds or raw based on config)
    if (hpLoss > 0) await adjustHP(-hpLoss);

    // If no armor hits, we’re done
    if (hits <= 0) {
      setText?.(
        'calcResult',
        `Damage ${dmg} (${sev}). HP -${hpLoss}. No armor hits.`
      );
      return;
    }

    // Read current protection rows
    const { data: rows, error } = await sb
      .from('character_equipment')
      .select(
        'id, slot, item_id, slots_remaining, exo_left, item:items(id, name, armor_value, ability_id)'
      )
      .eq('character_id', ch.id)
      .in('slot', ARMOR_SLOTS);

    if (error) {
      setText?.(
        'calcResult',
        `Damage ${dmg} (${sev}). HP -${hpLoss}. Couldn’t read armor.`
      );
      return;
    }

    // Eligible slots: any with armor>0 or exo>0
    let elig = (rows || []).filter(
      (r) => Number(r.slots_remaining || 0) > 0 || Number(r.exo_left || 0) > 0
    );
    if (!elig.length) {
      await afterUpdate?.();
      setText?.(
        'calcResult',
        `Damage ${dmg} (${sev}). HP -${hpLoss}. No armor to hit.`
      );
      return;
    }

    // Sticky targeting: spend until the slot is out; then, if hits remain, pick ONE new random target
    let remaining = hits;
    const log = [];

    // 1) pick first target randomly
    let current = elig[Math.floor(Math.random() * elig.length)];
    remaining = await spendHitsOnSlot(sb, current, remaining, log);

    // 2) if we still have hits and the first target cannot absorb more (armor=0 & exo=0),
    //    pick exactly one other slot for the leftover. If the first still has capacity,
    //    keep spending there (no scattering).
    while (remaining > 0) {
      const hasCapacity =
        Number(current.slots_remaining || 0) > 0 ||
        Number(current.exo_left || 0) > 0;

      if (hasCapacity && !current._deleted) {
        // keep drilling the same piece
        remaining = await spendHitsOnSlot(sb, current, remaining, log);
        continue;
      }

      // move to a different slot ONCE
      elig = (rows || []).filter(
        (r) => Number(r.slots_remaining || 0) > 0 || Number(r.exo_left || 0) > 0
      );

      // remove current (if it still exists) from candidate pool
      elig = elig.filter((r) => r.id !== current.id);

      if (!elig.length) break; // nowhere else to go; excess dissipates

      current = elig[Math.floor(Math.random() * elig.length)];
      remaining = await spendHitsOnSlot(sb, current, remaining, log);

      // After moving once, if there are still more hits left, they’ll continue to hit this second slot
      // (still “non-scatter”: first slot → second slot only).
    }

    await afterUpdate?.();

    const msg =
      `Damage ${dmg} (${sev}). HP -${hpLoss}. Armor hits: ${hits}` +
      (log.length ? ` → ${log.join(' · ')}` : '') +
      (remaining > 0 ? ' (excess dissipates)' : '');
    setText?.('calcResult', msg);
  }

  App.Logic.strip = { getSeverity, pointsFor, hpLossFor, applyHitFromCalc };
})(window.App);

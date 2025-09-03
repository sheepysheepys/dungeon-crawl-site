// /js/logic/rests.js
(function (App) {
  App.Logic = App.Logic || {};

  const ARMOR_SLOTS = ['head', 'chest', 'legs', 'hands', 'feet'];

  // --- tiny utils here so character.js stays clean ---
  function roll(n, sides) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Math.floor(Math.random() * sides) + 1;
    return sum;
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // --- ensure there is ONE row per armor slot; exo-only if needed ---
  async function ensureExoRowsForAllSlots(sb, ch) {
    const { data: existing, error: readErr } = await sb
      .from('character_equipment')
      .select('slot')
      .eq('character_id', ch.id)
      .in('slot', ARMOR_SLOTS);

    if (readErr) {
      return { ok: false, created: 0, reason: 'read', error: readErr };
    }

    const have = new Set((existing || []).map((r) => r.slot));
    const missing = ARMOR_SLOTS.filter((s) => !have.has(s));
    if (!missing.length) return { ok: true, created: 0 };

    const inserts = missing.map((slot) => ({
      character_id: ch.id,
      slot,
      item_id: null, // exo-only
      slots_remaining: 0, // no armor
      exo_left: 1, // exo on
    }));
    const { error: insErr } = await sb
      .from('character_equipment')
      .insert(inserts);
    if (insErr) {
      return { ok: false, created: 0, reason: 'insert', error: insErr };
    }
    return { ok: true, created: inserts.length };
  }

  // --- SHORT REST: pick up to 2 options (logic only) ---
  // opts = { hp1d4, repair1d4, hopePlus1, exoOne }
  async function applyShortRest(sb, ch, opts = {}) {
    const results = [];

    // 1) HP 1d4
    if (opts.hp1d4) {
      const heal = roll(1, 4);
      const next = Math.min(
        Number(ch.hp_total ?? 0),
        Number(ch.hp_current ?? 0) + heal
      );
      const { data, error } = await sb
        .from('characters')
        .update({ hp_current: next })
        .eq('id', ch.id)
        .select('hp_current')
        .single();
      if (!error) {
        const gained = data.hp_current - (Number(ch.hp_current) || 0);
        ch.hp_current = data.hp_current;
        results.push(`HP +${gained} (1d4=${heal})`);
      } else {
        results.push('HP heal failed');
      }
    }

    // 2) Repair armor: +1 to 1d4 damaged equipped pieces (random)
    if (opts.repair1d4) {
      const n = roll(1, 4);
      const { data: eq } = await sb
        .from('character_equipment')
        .select('id, slot, slots_remaining, item:items(armor_value)')
        .eq('character_id', ch.id)
        .in('slot', ARMOR_SLOTS)
        .not('item_id', 'is', null); // only equipped items
      const damaged = (eq || []).filter(
        (r) => Number(r.slots_remaining || 0) < Number(r.item?.armor_value || 0)
      );
      let repaired = 0;
      if (damaged.length) {
        for (const r of shuffle(damaged).slice(0, n)) {
          const cap = Math.max(0, Number(r.item?.armor_value || 0));
          const cur = Math.max(0, Number(r.slots_remaining || 0));
          if (cur < cap) {
            await sb
              .from('character_equipment')
              .update({ slots_remaining: cur + 1 })
              .eq('id', r.id);
            repaired++;
          }
        }
      }
      results.push(
        repaired
          ? `Armor +1 on ${repaired} slot${repaired === 1 ? '' : 's'}`
          : 'No damaged armor to repair'
      );
    }

    // 3) Hope +1 (cap 5)
    if (opts.hopePlus1) {
      const next = Math.min(5, Number(ch.hope_points ?? 0) + 1);
      const { data, error } = await sb
        .from('characters')
        .update({ hope_points: next })
        .eq('id', ch.id)
        .select('hope_points')
        .single();
      if (!error) {
        ch.hope_points = data.hope_points;
        results.push('Hope +1');
      } else {
        results.push('Hope update failed');
      }
    }

    // 4) Restore exo on ONE random slot that’s missing it.
    //    If no row exists (fully stripped), recreate one exo-only row.
    if (opts.exoOne) {
      // read existing rows on armor slots
      const { data: rows } = await sb
        .from('character_equipment')
        .select('id, slot, exo_left')
        .eq('character_id', ch.id)
        .in('slot', ARMOR_SLOTS);

      const haveBySlot = new Map((rows || []).map((r) => [r.slot, r]));
      const missing = ARMOR_SLOTS.filter((s) => !haveBySlot.has(s)); // fully stripped (no row)
      const zeroExo = (rows || []).filter((r) => Number(r.exo_left || 0) === 0); // row present, exo=0

      if (missing.length || zeroExo.length) {
        // Prefer restoring a present row first; otherwise recreate one missing.
        let chosen;
        if (zeroExo.length) {
          chosen = zeroExo[Math.floor(Math.random() * zeroExo.length)];
          await sb
            .from('character_equipment')
            .update({ exo_left: 1 })
            .eq('id', chosen.id);
          results.push(
            `Exoskin restored on ${String(chosen.slot || '').toUpperCase()}`
          );
        } else {
          const slot = missing[Math.floor(Math.random() * missing.length)];
          await sb.from('character_equipment').insert({
            character_id: ch.id,
            slot,
            item_id: null,
            slots_remaining: 0,
            exo_left: 1,
          });
          results.push(`Exoskin restored on ${slot.toUpperCase()}`);
        }
      } else {
        results.push('No exoskin to restore');
      }
    }

    return results;
  }

  // --- LONG REST: choose 2; exo ALWAYS restored on all 5 slots ---
  // opts = { fullHeal, repairAll, hopePlus2, projectName }
  async function applyLongRest(sb, ch, opts = {}) {
    const results = [];

    // Ensure rows exist and set exo=1 on all five slots
    await ensureExoRowsForAllSlots(sb, ch);
    await sb
      .from('character_equipment')
      .update({ exo_left: 1 })
      .eq('character_id', ch.id)
      .in('slot', ARMOR_SLOTS);
    results.push('Exoskin restored on all slots');

    // 1) Full heal
    if (opts.fullHeal) {
      const { data, error } = await sb
        .from('characters')
        .update({ hp_current: Number(ch.hp_total ?? 0) })
        .eq('id', ch.id)
        .select('hp_current')
        .single();
      if (!error) {
        ch.hp_current = data.hp_current;
        results.push('HP fully restored');
      } else {
        results.push('HP restore failed');
      }
    }

    // 2) Repair all equipped armor to full
    if (opts.repairAll) {
      const { data: eqRows } = await sb
        .from('character_equipment')
        .select('id, item_id, slots_remaining, item:items(armor_value)')
        .eq('character_id', ch.id)
        .in('slot', ARMOR_SLOTS);
      let fixed = 0;
      for (const r of eqRows || []) {
        if (r.item_id) {
          const cap = Math.max(0, Number(r.item?.armor_value || 0));
          const cur = Math.max(0, Number(r.slots_remaining || 0));
          if (cur < cap) {
            await sb
              .from('character_equipment')
              .update({ slots_remaining: cap })
              .eq('id', r.id);
            fixed++;
          }
        }
      }
      results.push(
        fixed
          ? `Repaired ${fixed} armor piece${fixed === 1 ? '' : 's'} to full`
          : 'No armor needed repairs'
      );
    }

    // 3) Hope +2 (cap 5)
    if (opts.hopePlus2) {
      const next = Math.min(5, Number(ch.hope_points ?? 0) + 2);
      const { data, error } = await sb
        .from('characters')
        .update({ hope_points: next })
        .eq('id', ch.id)
        .select('hope_points')
        .single();
      if (!error) {
        ch.hope_points = data.hope_points;
        results.push('Hope +2');
      } else {
        results.push('Hope update failed');
      }
    }

    // 4) Project tick (log to notes for now)
    if (opts.projectName && opts.projectName.trim()) {
      const stamp = new Date().toISOString().slice(0, 10);
      const entry = `[${stamp}] Long Rest: Worked on project: ${opts.projectName.trim()} (+1)`;
      const newNotes = (ch.notes ? ch.notes + '\n' : '') + entry;
      const { data } = await sb
        .from('characters')
        .update({ notes: newNotes })
        .eq('id', ch.id)
        .select('notes')
        .single();
      ch.notes = data.notes;
      results.push(`Project tick logged (${opts.projectName.trim()})`);
    }

    return results;
  }

  App.Logic.rests = {
    ensureExoRowsForAllSlots,
    applyShortRest,
    applyLongRest,
    _util: { roll, shuffle, ARMOR_SLOTS }, // optional export
  };
})(window.App);

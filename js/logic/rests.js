// /js/logic/rests.js
(function (App) {
  async function reloadCharacter(sb, chId) {
    const { data, error } = await sb
      .from('characters')
      .select(
        'id,hp_current,hp_total,hope_points,exoskin_slots_max,exoskin_slots_remaining'
      )
      .eq('id', chId)
      .maybeSingle();
    if (!error && data) {
      Object.assign(AppState.character, data);
    }
    return { data, error };
  }

  function roll1d4() {
    return Math.floor(Math.random() * 4) + 1;
  }

  const ARMOR_SLOTS = ['head', 'chest', 'legs', 'hands', 'feet'];

  // ---- NEW: small helper to open the Repair Bench modal ----
  function openRepairBench({
    cap,
    equippedOnly = true,
    allowUpTier = false,
    allowLegendary = false,
  } = {}) {
    try {
      // Ensure the feature is wired once
      if (!App?.Features?.repairBench?.open) {
        console.warn(
          '[rests] repairBench feature not found. Did you include /js/features/repair-bench.js?'
        );
        return false;
      }
      if (App?.Features?.repairBench?.wire) {
        // wire() is idempotent in the feature module
        App.Features.repairBench.wire();
      }
      App.Features.repairBench.open({
        cap: cap ?? Infinity,
        equippedOnly,
        allowUpTier,
        allowLegendary,
      });
      return true;
    } catch (e) {
      console.warn('[rests] failed to open repair bench', e);
      return false;
    }
  }
  // ----------------------------------------------------------

  // Repair up to N armor segments across equipped armor (favor most damaged first)
  async function repairArmorSegments(sb, chId, nSegments) {
    if (nSegments <= 0) return 0;

    const { data: eqp } = await sb
      .from('character_equipment')
      .select(
        'id, slot, item_id, slots_remaining, exo_left, item:items(armor_value)'
      )
      .eq('character_id', chId)
      .in('slot', ARMOR_SLOTS);

    const rows = (eqp || []).filter(
      (r) => r.item_id && r.item?.armor_value > 0
    );
    // sort by most damaged: (max - current) desc
    rows.sort(
      (a, b) =>
        b.item.armor_value -
        (b.slots_remaining || 0) -
        (a.item.armor_value - (a.slots_remaining || 0))
    );

    let left = nSegments,
      totalApplied = 0;
    for (const r of rows) {
      if (left <= 0) break;
      const max = Number(r.item.armor_value || 0);
      const cur = Number(r.slots_remaining || 0);
      if (cur >= max) continue;
      const add = Math.min(left, max - cur);
      await sb
        .from('character_equipment')
        .update({ slots_remaining: cur + add })
        .eq('id', r.id);
      totalApplied += add;
      left -= add;
    }
    return totalApplied;
  }

  // Ensure there is a row for each armor slot (exo-only row if no item)
  async function ensureExoRows(sb, chId) {
    const { data: existing } = await sb
      .from('character_equipment')
      .select('slot')
      .eq('character_id', chId)
      .in('slot', ARMOR_SLOTS);
    const have = new Set((existing || []).map((r) => r.slot));
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

  async function restoreOneExo(sb, chId) {
    // find a slot with exo_left = 0, set to 1 (any one)
    const { data: damaged } = await sb
      .from('character_equipment')
      .select('id, slot, exo_left')
      .eq('character_id', chId)
      .in('slot', ARMOR_SLOTS)
      .eq('exo_left', 0)
      .limit(1);
    if (damaged && damaged[0]) {
      await sb
        .from('character_equipment')
        .update({ exo_left: 1 })
        .eq('id', damaged[0].id);
      return damaged[0].slot;
    }
    return null;
  }

  async function restoreAllExo(sb, chId) {
    await ensureExoRows(sb, chId);
    await sb
      .from('character_equipment')
      .update({ exo_left: 1 })
      .eq('character_id', chId)
      .in('slot', ARMOR_SLOTS);
  }

  async function fullRepairAllEquippedArmor(sb, chId) {
    // Load equipped armor with max values
    const { data: eqp } = await sb
      .from('character_equipment')
      .select('id, slot, item_id, item:items(armor_value)')
      .eq('character_id', chId)
      .in('slot', ARMOR_SLOTS);

    for (const r of eqp || []) {
      const max = Number(r?.item?.armor_value || 0);
      if (r.item_id && max > 0) {
        await sb
          .from('character_equipment')
          .update({ slots_remaining: max })
          .eq('id', r.id);
      }
    }
  }

  App.Logic = App.Logic || {};
  App.Logic.rests = {
    async applyShortRest(sb, ch, opts) {
      const out = [];
      const chId = ch.id;

      // HP 1d4
      if (opts.hp1d4) {
        const gain = roll1d4();
        const next = Math.min(
          Number(ch.hp_total || 0),
          Number(ch.hp_current || 0) + gain
        );
        await sb.from('characters').update({ hp_current: next }).eq('id', chId);
        out.push(`+${gain} HP`);
      }

      // OPTION A (new): Open Repair Bench to fix ONE equipped piece (player chooses auto/manual)
      // Trigger with opts.repairOneArmor === true
      if (opts.repairOneArmor) {
        const opened = openRepairBench({
          cap: 1,
          equippedOnly: true,
          allowUpTier: false,
          allowLegendary: false,
        });
        if (opened) out.push('Repair Bench: 1 repair available');
      }
      // OPTION B (legacy): keep your old 1d4 segments repair if desired
      else if (opts.repair1d4) {
        const n = roll1d4();
        const applied = await repairArmorSegments(sb, chId, n);
        out.push(`Repair ${applied}/${n} armor`);
      }

      // Hope +1
      if (opts.hopePlus1) {
        const nextHope = Math.min(5, Number(ch.hope_points || 0) + 1);
        await sb
          .from('characters')
          .update({ hope_points: nextHope })
          .eq('id', chId);
        out.push(`+1 Hope`);
      }

      // Exo restore on one slot
      if (opts.exoOne) {
        await ensureExoRows(sb, chId);
        const which = await restoreOneExo(sb, chId);
        out.push(which ? `Exo restored: ${which}` : `Exo already full`);
      }

      await reloadCharacter(sb, chId);
      return out;
    },

    async applyLongRest(sb, ch, opts) {
      const out = [];
      const chId = ch.id;

      // Full heal
      if (opts.fullHeal) {
        await sb
          .from('characters')
          .update({ hp_current: ch.hp_total })
          .eq('id', chId);
        out.push(`HP → max`);
      }

      // LONG REST REPAIRS
      // If the UI checkbox "Repair equipped armor" is checked, pass opts.repairEquippedArmor === true
      // → Open Repair Bench with cap = Infinity (repairs ALL broken equipped pieces, auto or manual).
      if (opts.repairEquippedArmor) {
        const opened = openRepairBench({
          cap: Infinity,
          equippedOnly: true,
          allowUpTier: false,
          allowLegendary: false,
        });
        if (opened)
          out.push(
            'Repair Bench: all equipped broken armor available for repair'
          );
      }
      // Otherwise, if you still want a pure instant full repair fallback:
      else if (opts.repairAll) {
        await fullRepairAllEquippedArmor(sb, chId);
        out.push(`Armor fully repaired`);
      }

      // Hope +2
      if (opts.hopePlus2) {
        const nextHope = Math.min(5, Number(ch.hope_points || 0) + 2);
        await sb
          .from('characters')
          .update({ hope_points: nextHope })
          .eq('id', chId);
        out.push(`+2 Hope`);
      }

      // Exo: restore all 5 slots
      await restoreAllExo(sb, chId);
      out.push(`Exo restored (all slots)`);

      await reloadCharacter(sb, chId);
      return out;
    },
  };
})(window.App || (window.App = {}));

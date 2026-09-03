// logic/proficiency.js — proficiency bonus and spell save DC
(function (global) {
  const App = (global.App = global.App || { Logic: {} });

  function proficiencyBonus(classLevel) {
    const lvl = Math.max(1, Number(classLevel) || 1);
    return Math.ceil(lvl / 4) + 1;
  }

  function formatMod(n) {
    const v = Number(n) || 0;
    return v >= 0 ? `+${v}` : `${v}`;
  }

  function readStatTotal(statsRow, stat) {
    const row = statsRow || {};
    const base = Number(row[`stat_${stat}`] ?? row[`trait_${stat}_base`] ?? 0);
    const extra = Number(
      row[`stat_${stat}_bonus`] ?? row[`trait_${stat}_bonus`] ?? 0
    );
    return Math.min(20, base + extra);
  }

  function spellSaveDc(statsRow, classLevel, spellStat) {
    if (!spellStat) return null;
    const prof = proficiencyBonus(classLevel);
    const mod = global.computeBonus?.(readStatTotal(statsRow, spellStat)) ?? 0;
    return 8 + prof + mod;
  }

  function spellAttackMod(statsRow, classLevel, spellStat) {
    if (!spellStat) return null;
    const prof = proficiencyBonus(classLevel);
    const mod = global.computeBonus?.(readStatTotal(statsRow, spellStat)) ?? 0;
    return prof + mod;
  }

  function renderProficiencyBonus(classLevel) {
    global.setText?.('profBonus', formatMod(proficiencyBonus(classLevel)));
  }

  function renderSpellcasting(character, statsRow, classMeta) {
    const pill = document.getElementById('spellDcPill');
    const atkPill = document.getElementById('spellAtkPill');
    const classLevel = Math.max(1, Number(character?.class_level) || 1);
    const spell = classMeta?.spellcasting;

    const show = spell && classLevel >= spell.level;

    if (pill) pill.hidden = !show;
    if (atkPill) atkPill.hidden = !show;

    if (!show) {
      global.setText?.('spellSaveDc', '—');
      global.setText?.('spellAttackMod', '—');
      return;
    }

    global.setText?.(
      'spellSaveDc',
      String(spellSaveDc(statsRow, classLevel, spell.stat))
    );
    global.setText?.(
      'spellAttackMod',
      formatMod(spellAttackMod(statsRow, classLevel, spell.stat))
    );

    const label = document.getElementById('spellDcStatLabel');
    if (label) {
      label.textContent = spell.label || spell.stat;
    }
  }

  async function renderAll(character, statsRow) {
    if (!character) return statsRow || {};

    const classMeta = await App.Features?.dnd5e?.fetchClassMeta?.(
      character.class
    );

    renderProficiencyBonus(character.class_level);
    renderSpellcasting(character, statsRow || {}, classMeta);

    return statsRow || {};
  }

  App.Logic.proficiency = {
    proficiencyBonus,
    formatMod,
    readStatTotal,
    spellSaveDc,
    spellAttackMod,
    renderAll,
  };
})(window);

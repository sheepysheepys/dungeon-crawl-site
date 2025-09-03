// /js/traits-helpers.js
(function () {
  const TRAITS = [
    'agility',
    'strength',
    'finesse',
    'instinct',
    'presence',
    'knowledge',
  ];

  function clampScore(val) {
    return Math.min(20, Number(val) || 0); // cap at 20 for now
  }

  function computeBonus(total) {
    return Math.floor((total - 10) / 2);
  }

  function readBase(cs, stat) {
    const obj = cs || {};
    if (`trait_${stat}_base` in obj)
      return Number(obj[`trait_${stat}_base`] ?? 0);
    if (`stat_${stat}` in obj) return Number(obj[`stat_${stat}`] ?? 0);
    return 0;
  }

  function readExtra(cs, stat) {
    const obj = cs || {};
    if (`trait_${stat}_bonus` in obj)
      return Number(obj[`trait_${stat}_bonus`] ?? 0);
    if (`stat_${stat}_bonus` in obj)
      return Number(obj[`stat_${stat}_bonus`] ?? 0);
    return 0;
  }

  function renderAllTraits(cs) {
    const obj = cs || {};
    TRAITS.forEach((stat) => {
      const base = readBase(obj, stat);
      const extra = readExtra(obj, stat);
      const total = clampScore(base + extra);
      const bonus = computeBonus(total);

      // TOP number = bonus (modifier)
      const sign = bonus >= 0 ? `+${bonus}` : `${bonus}`;
      window.setText?.(`stat-${stat}-total`, sign);

      // BOTTOM number = raw score
      window.setText?.(`stat-${stat}-break`, total);
    });
  }

  window.TRAITS = TRAITS;
  window.computeBonus = computeBonus;
  window.renderAllTraits = renderAllTraits;
})();

async function handleAbilityOnEquip(itemId, slot) {
  // fetch item + its ability
  const { data: item, error: itemErr } = await client
    .from('items')
    .select('id, name, ability:abilities(id, name, slot, description)')
    .eq('id', itemId)
    .single();
  if (itemErr || !item?.ability) return; // no ability → nothing to do

  const ab = item.ability;

  // check if character already has an active ability in this slot
  const { data: existing } = await client
    .from('character_abilities')
    .select('id, ability_id, slot')
    .eq('character_id', state.character.id)
    .eq('slot', ab.slot)
    .maybeSingle();

  if (!existing) {
    await client.from('character_abilities').insert({
      character_id: state.character.id,
      ability_id: ab.id,
      slot: ab.slot,
      source_item_id: itemId,
    });
    setText('msg', `Activated ${ab.name}.`);
    setTimeout(() => setText('msg', ''), 1200);
    return;
  }

  const replace = window.confirm(
    `You already have an active ${ab.slot} ability.\n` +
      `Replace it with "${ab.name}"?`
  );
  if (!replace) return;

  await client.from('character_abilities').upsert({
    id: existing.id,
    character_id: state.character.id,
    ability_id: ab.id,
    slot: ab.slot,
    source_item_id: itemId,
  });
  setText('msg', `Replaced ${ab.slot} ability with ${ab.name}.`);
  setTimeout(() => setText('msg', ''), 1200);
}

// ---------- ARMOR TOTAL ----------
async function computeArmorTotal(characterId) {
  const { data } = await client
    .from('character_equipment')
    .select('item:items(armor_value)')
    .eq('character_id', characterId);

  const total = (data || []).reduce(
    (s, r) => s + (r.item?.armor_value || 0),
    0
  );
  setText('armorOverall', total);
}

// ---------- ABILITIES ----------
async function loadActiveAbilities() {
  const { data, error } = await client
    .from('character_abilities')
    .select('slot, ability:abilities(name, description)')
    .eq('character_id', state.character.id);
  if (error) {
    console.error('[abilities] read error', error);
    return [];
  }
  return data || [];
}

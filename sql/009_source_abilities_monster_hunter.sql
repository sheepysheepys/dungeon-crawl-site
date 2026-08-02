-- Grim Hollow: Monster Hunter (Playtest 3) class features for Manon Abraxos.
-- Run in Supabase SQL Editor (requires 003_source_abilities.sql).
--
-- Guild features are prefixed (Carver / Trapper / Devourer) — hide or delete
-- the guilds Manon did not choose once you know her pick.

insert into public.source_abilities (source_type, source_name, name, description, level_required)
values
  -- ========== LEVEL 1 ==========
  (
    'class',
    'Monster Hunter',
    'Fighting Style: Archery',
    'You gain a +2 bonus to attack rolls you make with ranged weapons.',
    1
  ),
  (
    'class',
    'Monster Hunter',
    'Fighting Style: Duelling',
    'When you are wielding a melee weapon in one hand and no other weapons, you gain a +2 bonus to damage rolls with that weapon.',
    1
  ),
  (
    'class',
    'Monster Hunter',
    'Fighting Style: Great Weapon Fighting',
    'When you roll a 1 or 2 on a damage die for an attack you make with a melee weapon that you are wielding with two hands, you can reroll the die and must use the new roll, even if the new roll is a 1 or a 2. The weapon must have the two-handed or versatile property.',
    1
  ),
  (
    'class',
    'Monster Hunter',
    'Fighting Style: Two-Weapon Fighting',
    'When you engage in two-weapon fighting, you can add your ability modifier to the damage of the second attack.',
    1
  ),
  (
    'class',
    'Monster Hunter',
    'Monster Grimoire',
    'Choose two monster types you specialize in hunting (aberrations, beasts, constructs, dragons, elementals, fey, fiends, giants, monstrosities, oozes, plants, undead, or humanoids [shapechangers]).

You add your proficiency bonus to Intelligence and Wisdom checks relating to those monsters. If already proficient, you double your proficiency bonus for that check. You also learn one language spoken by a monster type in your grimoire.

If you lose your grimoire, you cannot take another monster hunter level until it is replaced (8 hours + 50 gp to recreate).',
    1
  ),

  -- ========== LEVEL 2 ==========
  (
    'class',
    'Monster Hunter',
    'Hunter''s Instincts',
    'As a bonus action, choose one creature you can see within 60 feet and make an Intelligence (Investigation) check (DC 5 + creature CR; auto-success if CR less than 1). On success, learn one of: creature type, AC, damage resistances/immunities, or damage vulnerabilities.

After 1+ minute observing outside combat, learn the first two automatically and the second two with one check. If information is magically concealed, you learn it is concealed instead.',
    2
  ),

  -- ========== LEVEL 3 — HUNTING GUILD ==========
  (
    'class',
    'Monster Hunter',
    'Hunting Guild',
    'At 3rd level, choose Carver Guild, Trapper Guild, or Devourer Guild. You gain that guild''s features at 3rd, 7th, 10th, 15th, and 18th level.',
    3
  ),

  -- Carver Guild
  (
    'class',
    'Monster Hunter',
    'Carver Guild — Equipped for Battle',
    'You gain proficiency with heavy armor.',
    3
  ),
  (
    'class',
    'Monster Hunter',
    'Carver Guild — Close Quarters',
    'Whenever you hit a creature with a melee weapon attack you can mark them until the start of your next turn. While marked creatures are adjacent to you, they have disadvantage on attack rolls against you.',
    3
  ),
  (
    'class',
    'Monster Hunter',
    'Carver Guild — True Grit',
    'You are immune to being frightened by creature types written about in your grimoire.',
    3
  ),

  -- Trapper Guild
  (
    'class',
    'Monster Hunter',
    'Trapper Guild — Bonus Proficiency',
    'You gain proficiency in the Stealth skill.',
    3
  ),
  (
    'class',
    'Monster Hunter',
    'Trapper Guild — Trapper''s Tools',
    'You gain proficiency with Tinker''s tools. After each long rest, craft two trapper tools (or spend 1 hour + 20 gp to craft one during a short rest). Save DC = 8 + proficiency bonus + Intelligence modifier.

Tools: Elemental Ammunition (3× damage dice, acid/fire/lightning/poison/thunder), Push Plate (reaction push up to 20 ft), Scorpion Anchor (grapple on hit), Silver Bomb (20-ft sphere negates B/P/S resistances for listed types), Terrain Cloak (lightly obscured, Stealth advantage), Weretrap (3d10 bludgeoning + prone, set or thrown).',
    3
  ),
  (
    'class',
    'Monster Hunter',
    'Trapper Guild — Predatory Awareness',
    'You can''t be surprised by creature types in your grimoire while conscious.',
    3
  ),

  -- Devourer Guild
  (
    'class',
    'Monster Hunter',
    'Devourer Guild — Transmutating Metabolism',
    'Salvage one portion from creature remains (lasts 24 hours). As a bonus action, consume a portion for a benefit based on creature type. Safe consumption limit: 1 + Constitution modifier (min 1) per long rest; extra portions cause exhaustion.

Examples: Aberration — telepathy 60 ft + psychic resistance 1 hr; Beast — heal 2d8 + MH level; Dragon — fly 50 ft for 10 min; Undead — temp HP equal to half weapon damage dealt for 1 min; etc. (See full grimoire for all types.)

Spell portions use Intelligence as spellcasting ability.',
    3
  ),

  -- ========== LEVEL 5 ==========
  (
    'class',
    'Monster Hunter',
    'Extra Attack',
    'When you take the Attack action, you can attack twice instead of once.',
    5
  ),
  (
    'class',
    'Monster Hunter',
    'Grave Strike',
    'Use an action (or reaction on readied/opportunity attack) to make one weapon attack adding Intelligence to the attack roll. On hit, add extra damage equal to 1d8 × Intelligence modifier (minimum 1d8).

Uses = Intelligence modifier (minimum 1), recharged on short or long rest. A readied grave strike that is not performed does not expend a use.',
    5
  ),

  -- ========== LEVEL 6 ==========
  (
    'class',
    'Monster Hunter',
    'Monster Grimoire Improvement (6th)',
    'Add a third monster type to your grimoire (cannot duplicate a prior choice). Grimoire benefits apply to the new type. Weapon attacks against grimoire creatures score a critical hit on 19–20.',
    6
  ),

  -- ========== LEVEL 7 — GUILD ==========
  (
    'class',
    'Monster Hunter',
    'Carver Guild — Improved Salvage',
    'Advantage on ability checks to harvest salvage; collect twice as much when possible.',
    7
  ),
  (
    'class',
    'Monster Hunter',
    'Trapper Guild — Improved Crafting',
    'Craft items from salvage using half the salvage and half the time; if half salvage is impossible, halve one other required cost instead.',
    7
  ),
  (
    'class',
    'Monster Hunter',
    'Devourer Guild — Inherent Mutation',
    'Choose two permanent mutations: Metabolized Constitution (poison adv/res or immunity), Obsessive Consumption (2 + Con mod portions), Permanent Scales (AC 13 + Dex unarmored), Preternatural Reflexes (Dash/Disengage as bonus action), Rapid Recovery (spend Hit Die as action), Terrifying Appearance (Intimidation prof or expertise), Wall Crawler (climb speed = move), or Wolfen Senses (adv on Investigation and Perception hearing/smell).',
    7
  ),

  -- ========== LEVEL 9 ==========
  (
    'class',
    'Monster Hunter',
    'Recognized Professional',
    'Advantage on Charisma checks against non-hostile creatures when plying your trade (negotiating payment, asking about monsters, selling salvage).',
    9
  ),

  -- ========== LEVEL 10 — GUILD ==========
  (
    'class',
    'Monster Hunter',
    'Carver Guild — Grave Riposte',
    'If a creature you marked in melee misses you or attacks someone else, use your reaction to make a melee weapon attack or Grave Strike against them.',
    10
  ),
  (
    'class',
    'Monster Hunter',
    'Trapper Guild — Ambusher''s Advantage',
    'Bonus to initiative equal to Intelligence modifier. If you Grave Strike a creature that has not acted yet, you can bonus-action weapon attack as well.',
    10
  ),
  (
    'class',
    'Monster Hunter',
    'Devourer Guild — Alchemical Decoctions',
    'Proficiency with Alchemist''s supplies. Spend 1 hour + 20 gp to convert a portion into a decoction (no expiry). Others can consume one decoction per long rest safely (Constitution for spellcasting if needed).',
    10
  ),

  -- ========== LEVEL 11 ==========
  (
    'class',
    'Monster Hunter',
    'Rapid Grave Strike',
    'All weapon attacks deal an extra 1d8 damage. You may use Grave Strike as part of any Attack action instead of taking a full action.',
    11
  ),

  -- ========== LEVEL 13 ==========
  (
    'class',
    'Monster Hunter',
    'Monster Grimoire Improvement (13th)',
    'Add a fourth monster type to your grimoire (cannot duplicate a prior choice).',
    13
  ),
  (
    'class',
    'Monster Hunter',
    'Knowledgeable Defence',
    'Proficient in saves against creatures in your grimoire. If already proficient, add proficiency bonus twice.',
    13
  ),

  -- ========== LEVEL 14 ==========
  (
    'class',
    'Monster Hunter',
    'Enhanced Hunter''s Instincts',
    'As an action, investigate a clue (tracks, lair, remains, witness account). Intelligence (Investigation) DC 10 + CR (auto-success if CR less than 1). On success, learn one of: type, AC, resistances/immunities, or vulnerabilities. Misleading clues reveal they are misleading.',
    14
  ),

  -- ========== LEVEL 15 — GUILD ==========
  (
    'class',
    'Monster Hunter',
    'Carver Guild — Terror of Terrors',
    'When you mark a creature with a Grave Strike, they must succeed on a Wisdom save (DC 8 + proficiency + Str or Dex) or be frightened of you until end of your next turn.',
    15
  ),
  (
    'class',
    'Monster Hunter',
    'Trapper Guild — Monster Hide Armor',
    'After 4 hours with Tinker''s tools and light/medium armor, craft Monster Hide Armor (one suit at a time). Same base AC as source armor plus two features chosen from: Damage Resistance (3 types), Elemental Charge (imbue weapon damage), Hardened Defense (+2 AC), Regeneration (bonus action heal 1 HD + Con, 6/rest), Stealthy (no Stealth disadvantage, advantage to hide), Phase Leap (bonus action teleport 60 ft, 3/rest).',
    15
  ),
  (
    'class',
    'Monster Hunter',
    'Devourer Guild — Monstrous Gluttony',
    'Spend one Grave Strike use to make a special melee attack (Str or Dex): 1d6 piercing + 1d8 force × Intelligence modifier (min 1d8). On hit, instantly consume a portion of the target''s creature type.',
    15
  ),

  -- ========== LEVEL 17 ==========
  (
    'class',
    'Monster Hunter',
    'Monster Grimoire Improvement (17th)',
    'Add a fifth and final monster type to your grimoire (cannot duplicate a prior choice).',
    17
  ),

  -- ========== LEVEL 18 — GUILD ==========
  (
    'class',
    'Monster Hunter',
    'Carver Guild — Tireless Hunter',
    'If you have no Grave Strike uses when you roll initiative, gain one use.',
    18
  ),
  (
    'class',
    'Monster Hunter',
    'Trapper Guild — Rapid Tinkerer',
    'After a long rest, craft three trapper tools instead of two.',
    18
  ),
  (
    'class',
    'Monster Hunter',
    'Devourer Guild — Acquired Taste',
    'You can consume one additional portion or decoction before gaining exhaustion between long rests.',
    18
  ),

  -- ========== LEVEL 20 ==========
  (
    'class',
    'Monster Hunter',
    'Grave Execution',
    'If a grimoire creature has 50 HP or less when you hit it with Grave Strike, force a Constitution save (DC 8 + proficiency + Str or Dex). On failure, the creature drops to 0 HP; on success, Grave Strike deals damage normally.',
    20
  );

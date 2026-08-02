-- Yuan-ti, Shadar Kai, Silkborn race traits + Lyra's Hexblade/Raven Queen warlock features.
-- Run in Supabase SQL Editor (requires 003_source_abilities.sql).

-- ========== YUAN-TI (Pureblood) ==========
insert into public.source_abilities (source_type, source_name, name, description, level_required)
values
  (
    'race',
    'Yuan-ti',
    'Darkvision',
    'You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were dim light. You can''t discern color in darkness, only shades of gray.',
    1
  ),
  (
    'race',
    'Yuan-ti',
    'Innate Spellcasting — Poison Spray & Animal Friendship',
    'You know the Poison Spray cantrip. You can cast Animal Friendship an unlimited number of times with this trait, but you can target only snakes with it. Charisma is your spellcasting ability for these spells.',
    1
  ),
  (
    'race',
    'Yuan-ti',
    'Innate Spellcasting — Suggestion',
    'You can cast Suggestion with this trait. Once you cast it, you can''t do so again until you finish a long rest. Charisma is your spellcasting ability for this spell.',
    3
  ),
  (
    'race',
    'Yuan-ti',
    'Magic Resistance',
    'You have advantage on saving throws against spells and other magical effects.',
    1
  ),
  (
    'race',
    'Yuan-ti',
    'Poison Immunity',
    'You are immune to poison damage and the poisoned condition.',
    1
  );

-- ========== SHADAR-KAI ==========
insert into public.source_abilities (source_type, source_name, name, description, level_required)
values
  (
    'race',
    'Shadar Kai',
    'Blessing of the Raven Queen',
    'As a bonus action, you can magically teleport up to 30 feet to an unoccupied space you can see. You can use this trait a number of times equal to your proficiency bonus, and you regain all expended uses when you finish a long rest.',
    1
  ),
  (
    'race',
    'Shadar Kai',
    'Blessing of the Raven Queen — Ghostly Resistance',
    'When you teleport using Blessing of the Raven Queen, you also gain resistance to all damage until the start of your next turn. During that time, you appear ghostly and translucent.',
    3
  ),
  (
    'race',
    'Shadar Kai',
    'Darkvision',
    'You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were dim light. You discern colors in that darkness only as shades of gray.',
    1
  ),
  (
    'race',
    'Shadar Kai',
    'Fey Ancestry',
    'You have advantage on saving throws you make to avoid or end the charmed condition on yourself.',
    1
  ),
  (
    'race',
    'Shadar Kai',
    'Keen Senses',
    'You have proficiency in the Perception skill.',
    1
  ),
  (
    'race',
    'Shadar Kai',
    'Necrotic Resistance',
    'You have resistance to necrotic damage.',
    1
  ),
  (
    'race',
    'Shadar Kai',
    'Trance',
    'You don''t need to sleep, and magic can''t put you to sleep. You can finish a long rest in 4 hours if you spend those hours in a trancelike meditation, during which you retain consciousness.

Whenever you finish this trance, you can gain two proficiencies that you don''t have, each one with a weapon or a tool of your choice selected from the Player''s Handbook. You mystically acquire these proficiencies by drawing them from shared elven memory, and you retain them until you finish your next long rest.',
    1
  );

-- ========== SILKBORN ==========
insert into public.source_abilities (source_type, source_name, name, description, level_required)
values
  (
    'race',
    'Silkborn',
    'Bejeweled Carapace',
    'When you are hit with an attack roll, you can use your reaction to add your proficiency bonus to your AC against that attack, potentially causing it to miss. Once you use this trait, you can''t do so again until you finish a short or long rest.',
    1
  ),
  (
    'race',
    'Silkborn',
    'Silken Legacy — Thaumaturgy',
    'You know the thaumaturgy cantrip. Intelligence, Wisdom, or Charisma is your spellcasting ability for the spells you cast with this trait (choose the ability when you select this species).',
    1
  ),
  (
    'race',
    'Silkborn',
    'Silken Legacy — Find Familiar',
    'You can cast the find familiar spell using this trait (the familiar takes the form of a jewelled insect or arachnid), without material components. Once you cast find familiar with this trait, you can''t cast that spell with it again until you finish a long rest. You can also cast this spell using any spell slots you have of the appropriate level.',
    3
  ),
  (
    'race',
    'Silkborn',
    'Silken Legacy — Web',
    'You can cast the web spell using this trait, without material components. Once you cast web with this trait, you can''t cast that spell with it again until you finish a long rest. You can also cast this spell using any spell slots you have of the appropriate level.',
    5
  ),
  (
    'race',
    'Silkborn',
    'Spider Climb',
    'You have a climbing speed equal to your walking speed. You can climb difficult surfaces, including along ceilings, without needing an ability check and while leaving your hands free.',
    1
  );

-- ========== WARLOCK — HEXBLADE / RAVEN QUEEN (Lyra) ==========
insert into public.source_abilities (source_type, source_name, name, description, level_required)
values
  (
    'class',
    'Warlock',
    'Patron: The Raven Queen',
    'Rather than serving an evil sword, Lyra''s pact connects her to the Raven Queen. Her blade is an extension of the Raven Queen''s will. She isn''t forced into blind obedience — instead, she is offered fragments of forgotten knowledge in exchange for recovering memories, souls, or relics that have slipped from the Shadowfell.

"I wasn''t looking for power. I was looking for an explanation."

As a graduate researcher specializing in magical materials, Lyra recovered an ancient obsidian blade no one else could decipher. Every experiment failed — until she touched it. The blade spoke not in words, but in ideas. Now she is caught between scientific inquiry and something that refuses to be explained.',
    1
  ),
  (
    'class',
    'Warlock',
    'Hexblade''s Curse',
    'You gain a curse that empowers your attacks against a chosen foe. As a bonus action, choose one creature you can see within 30 feet. Until the curse ends, you gain a bonus to damage rolls against the cursed target equal to your proficiency bonus, and your weapon attacks against it score a critical hit on a roll of 19 or 20.

The curse lasts until the target dies, you die, or you are incapacitated. You can''t use this feature again until you finish a short or long rest.',
    1
  ),
  (
    'class',
    'Warlock',
    'Hex Warrior',
    'You acquire your mysterious blade through your pact. You can use Charisma instead of Strength or Dexterity for attack and damage rolls with a single one-handed weapon of your choice. You must be proficient with the weapon.

If the weapon lacks the two-handed property, you can use it as a spellcasting focus for your warlock spells.',
    1
  ),
  (
    'class',
    'Warlock',
    'Accursed Specter',
    'When you slay a humanoid with your Hexblade''s Curse, you can cause its spirit to rise as a specter. It obeys your verbal commands and takes its turn immediately after yours. It remains until the end of your next long rest.',
    6
  ),
  (
    'class',
    'Warlock',
    'Armor of Hexes',
    'When the cursed target forces you to make a saving throw, you can use your reaction to roll a d6 and add the result to your saving throw total, potentially causing the effect to fail.',
    10
  ),
  (
    'class',
    'Warlock',
    'Master of Hexes',
    'When the cursed target dies, you can apply the curse to a different creature you can see within 30 feet without expending a use of Hexblade''s Curse.',
    14
  );

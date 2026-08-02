-- Kenku (MotM) and Changeling (Eberron) race traits for the Abilities tab.
-- Run in Supabase SQL Editor (requires 003_source_abilities.sql).

insert into public.source_abilities (source_type, source_name, name, description)
values
  (
    'race',
    'Kenku',
    'Expert Duplication',
    'When you copy writing or craftwork produced by yourself or someone else, you have advantage on any ability checks you make to produce an exact duplicate.'
  ),
  (
    'race',
    'Kenku',
    'Kenku Recall',
    'Thanks to your supernaturally good memory, you have proficiency in two skills of your choice.

Moreover, when you make an ability check using any skill in which you have proficiency, you can give yourself advantage on the check before rolling the d20. You can give yourself advantage in this way a number of times equal to your proficiency bonus, and you regain all expended uses when you finish a long rest.'
  ),
  (
    'race',
    'Kenku',
    'Mimicry',
    'You can accurately mimic sounds you have heard, including voices. A creature that hears the sounds you make can tell they are imitations only with a successful Wisdom (Insight) check against a DC of 8 + your proficiency bonus + your Charisma modifier.'
  ),
  (
    'race',
    'Changeling',
    'Shapechanger',
    'As an action, you can change your appearance and your voice. You determine the specifics of the changes, including your coloration, hair length, and sex. You can also adjust your height and weight, but not so much that your size changes. You can make yourself appear as a member of another race, though none of your game statistics change. You can''t duplicate the appearance of a creature you''ve never seen, and you must adopt a form that has the same basic arrangement of limbs that you have. Your clothing and equipment aren''t changed by this trait.

You stay in the new form until you use an action to revert to your true form or until you die.'
  ),
  (
    'race',
    'Changeling',
    'Changeling Instincts',
    'You gain proficiency with two of the following skills of your choice: Deception, Insight, Intimidation, and Persuasion.'
  );

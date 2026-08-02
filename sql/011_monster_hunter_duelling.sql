-- Manon Abraxos: Duelling fighting style only.
-- Run in Supabase SQL Editor after 009/010.

delete from public.source_abilities
where source_type = 'class'
  and source_name = 'Monster Hunter'
  and name in (
    'Fighting Style: Archery',
    'Fighting Style: Great Weapon Fighting',
    'Fighting Style: Two-Weapon Fighting'
  );

update public.source_abilities
set name = 'Duelling'
where source_type = 'class'
  and source_name = 'Monster Hunter'
  and name = 'Fighting Style: Duelling';

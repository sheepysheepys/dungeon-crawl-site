-- Manon Abraxos chose Trapper Guild. Remove other guild features.
-- Run in Supabase SQL Editor after 009_source_abilities_monster_hunter.sql.

delete from public.source_abilities
where source_type = 'class'
  and source_name = 'Monster Hunter'
  and (
    name like 'Carver Guild%'
    or name like 'Devourer Guild%'
  );

update public.source_abilities
set
  name = 'Trapper Guild',
  description = 'You belong to the Trapper Guild — hunters who rely on preparation, stealth, and crafted tools. You gain Trapper features at 3rd, 7th, 10th, 15th, and 18th class level.'
where source_type = 'class'
  and source_name = 'Monster Hunter'
  and name = 'Hunting Guild';

update public.source_abilities
set name = replace(name, 'Trapper Guild — ', '')
where source_type = 'class'
  and source_name = 'Monster Hunter'
  and name like 'Trapper Guild — %';

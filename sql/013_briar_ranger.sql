-- Briar Sage Fletcher: Changeling Ranger
update public.characters
set class = 'Ranger'
where name ilike 'Briar Sage Fletcher'
  and (class is null or class ilike 'n/a' or class = '');

-- Remove duplicate custom race rows if 007 was applied more than once
delete from public.source_abilities a
using public.source_abilities b
where a.id > b.id
  and a.source_type = b.source_type
  and a.source_name = b.source_name
  and a.name = b.name;

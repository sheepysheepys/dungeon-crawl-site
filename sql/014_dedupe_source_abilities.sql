-- Remove duplicate custom abilities (e.g. if 007 was applied twice).
-- Keeps the oldest row for each source + name + level combination.

delete from public.source_abilities a
using public.source_abilities b
where a.id > b.id
  and a.source_type = b.source_type
  and lower(a.source_name) = lower(b.source_name)
  and a.name = b.name
  and a.level_required = b.level_required;

create unique index if not exists source_abilities_unique_key
  on public.source_abilities (
    source_type,
    lower(source_name),
    name,
    level_required
  );

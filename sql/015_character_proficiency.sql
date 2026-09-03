-- Per-stat proficiency flags for character saves/checks.
-- Run in Supabase SQL Editor.

alter table public.character_stats
  add column if not exists prof_agility boolean not null default false,
  add column if not exists prof_strength boolean not null default false,
  add column if not exists prof_finesse boolean not null default false,
  add column if not exists prof_instinct boolean not null default false,
  add column if not exists prof_presence boolean not null default false,
  add column if not exists prof_knowledge boolean not null default false;

-- Players can toggle their own character's proficiency flags.
drop policy if exists character_stats_owner_update on public.character_stats;
create policy character_stats_owner_update
  on public.character_stats
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.characters c
      where c.id = character_stats.character_id
        and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.characters c
      where c.id = character_stats.character_id
        and c.user_id = auth.uid()
    )
  );

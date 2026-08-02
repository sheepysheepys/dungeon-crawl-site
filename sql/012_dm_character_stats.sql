-- Let DMs edit character_stats from the DM tools sheet editor.
-- Run in Supabase SQL Editor.

alter table public.character_stats enable row level security;

drop policy if exists character_stats_dm_update on public.character_stats;
create policy character_stats_dm_update
  on public.character_stats
  for update
  to authenticated
  using (public.is_dm())
  with check (public.is_dm());

drop policy if exists character_stats_dm_insert on public.character_stats;
create policy character_stats_dm_insert
  on public.character_stats
  for insert
  to authenticated
  with check (public.is_dm());

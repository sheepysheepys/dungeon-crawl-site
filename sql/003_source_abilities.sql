-- Custom race/class abilities not covered by the SRD API (Kenku, Silkborn, etc.).
-- Run this in the Supabase SQL Editor.
--
-- Example inserts:
--   insert into public.source_abilities (source_type, source_name, name, description)
--   values ('race', 'Kenku', 'Mimicry', 'You can mimic sounds you have heard...');
--
--   insert into public.source_abilities (source_type, source_name, name, description, level_required)
--   values ('class', 'Monster Hunter', 'Slayer''s Mark', 'As a bonus action...', 3);

create table if not exists public.source_abilities (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('race', 'class')),
  source_name text not null,
  name text not null,
  description text not null default '',
  level_required integer not null default 1 check (level_required >= 1),
  created_at timestamptz not null default now()
);

create index if not exists source_abilities_lookup_idx
  on public.source_abilities (source_type, lower(source_name));

alter table public.source_abilities enable row level security;

drop policy if exists "source_abilities read" on public.source_abilities;
create policy "source_abilities read"
  on public.source_abilities
  for select
  to authenticated
  using (true);

drop policy if exists "source_abilities dm insert" on public.source_abilities;
create policy "source_abilities dm insert"
  on public.source_abilities
  for insert
  to authenticated
  with check (public.is_dm());

drop policy if exists "source_abilities dm update" on public.source_abilities;
create policy "source_abilities dm update"
  on public.source_abilities
  for update
  to authenticated
  using (public.is_dm())
  with check (public.is_dm());

drop policy if exists "source_abilities dm delete" on public.source_abilities;
create policy "source_abilities dm delete"
  on public.source_abilities
  for delete
  to authenticated
  using (public.is_dm());

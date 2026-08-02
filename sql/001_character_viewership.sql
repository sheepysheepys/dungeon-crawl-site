-- Viewership stats shown on the character sheet and edited from the DM page.
-- Run this in the Supabase SQL Editor.
--
-- One row per character. All three stats are nullable so the DM can leave a
-- field blank and have the sheet show "—" instead of a made-up zero.

create table if not exists public.character_viewership (
  character_id uuid primary key
    references public.characters (id) on delete cascade,
  viewers integer check (viewers is null or viewers >= 0),
  subscribers integer check (subscribers is null or subscribers >= 0),
  rank integer check (rank is null or rank >= 1),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

-- Ranks are a leaderboard position, so no two characters should share one.
create unique index if not exists character_viewership_rank_key
  on public.character_viewership (rank)
  where rank is not null;

alter table public.character_viewership enable row level security;

-- Helper so policies don't each re-query profiles inline.
-- SECURITY DEFINER lets it read profiles even when the caller's own RLS
-- policies on profiles would not permit reading another row.
create or replace function public.is_dm()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'dm'
  );
$$;

revoke execute on function public.is_dm() from public;
grant execute on function public.is_dm() to authenticated;

-- Players read their own character's stats; DMs read everyone's.
drop policy if exists viewership_select on public.character_viewership;
create policy viewership_select
  on public.character_viewership
  for select
  to authenticated
  using (
    public.is_dm()
    or exists (
      select 1
      from public.characters c
      where c.id = character_viewership.character_id
        and c.user_id = auth.uid()
    )
  );

-- Only DMs can write. Players must not be able to inflate their own numbers.
drop policy if exists viewership_dm_insert on public.character_viewership;
create policy viewership_dm_insert
  on public.character_viewership
  for insert
  to authenticated
  with check (public.is_dm());

drop policy if exists viewership_dm_update on public.character_viewership;
create policy viewership_dm_update
  on public.character_viewership
  for update
  to authenticated
  using (public.is_dm())
  with check (public.is_dm());

drop policy if exists viewership_dm_delete on public.character_viewership;
create policy viewership_dm_delete
  on public.character_viewership
  for delete
  to authenticated
  using (public.is_dm());

-- Keep updated_at honest regardless of what the client sends.
create or replace function public.touch_character_viewership()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists character_viewership_touch on public.character_viewership;
create trigger character_viewership_touch
  before insert or update on public.character_viewership
  for each row execute function public.touch_character_viewership();

-- Let the character sheet update live when the DM saves.
-- Non-fatal: the sheet still loads stats on page load without this.
do $$
begin
  alter publication supabase_realtime add table public.character_viewership;
exception
  when others then
    raise notice 'Skipped realtime publication: %', sqlerrm;
end;
$$;

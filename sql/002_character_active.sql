-- Active / inactive characters.
-- Inactive characters are hidden from rosters, dropdowns, bulk grants, and
-- player login. Run in the Supabase SQL Editor.

alter table public.characters
  add column if not exists is_active boolean not null default true;

-- Backfill any rows that somehow ended up null (shouldn't happen with NOT NULL).
update public.characters
set is_active = true
where is_active is null;

create index if not exists characters_is_active_idx
  on public.characters (is_active)
  where is_active = true;

-- Reuse the same helper from the viewership migration (safe to re-run).
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

-- DM-only write path for toggling active status.
-- Skip if you already have a broader DM update policy on characters.
drop policy if exists characters_dm_update on public.characters;
create policy characters_dm_update
  on public.characters
  for update
  to authenticated
  using (public.is_dm())
  with check (public.is_dm());

-- To reactivate from SQL if needed:
--   update public.characters set is_active = true where name ilike 'Character Name';

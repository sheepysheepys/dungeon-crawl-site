-- Global clothing display mode for all character sheets (DM-controlled).
-- Values: 'bar' (summary ticks) or 'slots' (per-body-part pips).
-- Run in Supabase SQL Editor.

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value)
values ('clothing_display', 'bar')
on conflict (key) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings
  for select to authenticated
  using (true);

drop policy if exists app_settings_dm_write on public.app_settings;
create policy app_settings_dm_write on public.app_settings
  for all to authenticated
  using (public.is_dm())
  with check (public.is_dm());

-- Realtime (best-effort)
do $$
begin
  alter publication supabase_realtime add table public.app_settings;
exception
  when duplicate_object then null;
  when others then null;
end $$;

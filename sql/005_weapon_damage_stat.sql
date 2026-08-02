-- Which ability score adds to a weapon's damage roll.
-- Run this in the Supabase SQL Editor.
--
-- Null = defaults to strength in the app.

alter table public.items
  add column if not exists damage_stat text
  check (
    damage_stat is null
    or damage_stat in (
      'strength',
      'agility',
      'finesse',
      'instinct',
      'presence',
      'knowledge'
    )
  );

-- Separate D&D class level from fast-paced campaign character level.
-- Run this in the Supabase SQL Editor.
--
-- `level`        = campaign character level (HP / stat growth)
-- `class_level`  = D&D class features (abilities tab, capped at 20 in the app)

alter table public.characters
  add column if not exists class_level integer not null default 1
  check (class_level >= 1);

update public.characters
set class_level = 1;

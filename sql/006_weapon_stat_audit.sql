-- One-time audit: assign damage_stat for all weapon/offhand items.
-- Run in Supabase SQL Editor after 005_weapon_damage_stat.sql.
--
-- Rules (matches js/logic/weapons.js inferDamageStat):
--   finesse  — notes mention finesse, or rapier/dagger/shortsword/knife/whip/stiletto
--   agility  — bows, crossbows, slings
--   strength — everything else

-- 1) Finesse weapons
update public.items
set damage_stat = 'finesse'
where slot in ('weapon', 'offhand')
  and (
    notes ilike '%finesse%'
    or name ilike '%rapier%'
    or name ilike '%dagger%'
    or name ilike '%shortsword%'
    or name ilike '%short sword%'
    or name ilike '%stiletto%'
    or name ilike '%whip%'
    or name ilike '%knife%'
    or name ilike '%knives%'
    or name ilike '%umbrella blade%'
    or name ilike '%spatula blade%'
  );

-- 2) Ranged → agility (only where not already finesse)
update public.items
set damage_stat = 'agility'
where slot in ('weapon', 'offhand')
  and (damage_stat is null or damage_stat = 'strength')
  and (
    name ilike '%crossbow%'
    or name ilike '%sling%'
    or name ilike '%recurve%'
    or name ilike '%shortbow%'
    or name ilike '%long bow%'
    or name ilike '%longbow%'
    or name ~* '\mbow\M'
  )
  and name not ilike '%elbow%';

-- 3) Remaining weapons → strength
update public.items
set damage_stat = 'strength'
where slot in ('weapon', 'offhand')
  and damage_stat is null;

-- Verify (optional):
-- select name, damage_stat, damage, notes
-- from public.items
-- where slot in ('weapon', 'offhand')
-- order by damage_stat, name;

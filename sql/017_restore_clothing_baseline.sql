-- DM helper: restore baseline clothing (5/5 exo) without touching equipped items.
-- Use after false knockdowns — does NOT re-grant stripped armor items.
-- Run in Supabase SQL Editor.

create or replace function public.rpc_restore_clothing_baseline(
  p_character_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slots text[] := array['head', 'chest', 'legs', 'hands', 'feet'];
  v_slot text;
begin
  if p_character_id is null then
    raise exception 'Character id is required';
  end if;

  if not exists (select 1 from public.characters c where c.id = p_character_id) then
    raise exception 'Character not found';
  end if;

  foreach v_slot in array v_slots loop
    if exists (
      select 1
      from public.character_equipment ce
      where ce.character_id = p_character_id
        and ce.slot = v_slot
    ) then
      update public.character_equipment
      set exo_left = 1
      where character_id = p_character_id
        and slot = v_slot;
    else
      insert into public.character_equipment (
        character_id, slot, item_id, slots_remaining, exo_left
      )
      values (p_character_id, v_slot, null, 0, 1);
    end if;
  end loop;

  update public.characters
  set exoskin_slots_remaining = 5
  where id = p_character_id;

  return jsonb_build_object(
    'character_id', p_character_id,
    'exo_restored', 5,
    'note', 'Equipped items unchanged; only exo/clothing baseline restored.'
  );
end;
$$;

grant execute on function public.rpc_restore_clothing_baseline(uuid) to authenticated;

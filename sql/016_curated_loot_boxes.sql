-- Curated loot box types + RPC seeding/open logic.
-- Run in Supabase SQL Editor.
--
-- Box types: weapon, armor, consumable, trinket, gold, general
-- Rarity caps which item rarities can roll (common ≤ uncommon ≤ rare …).

alter table public.loot_boxes
  add column if not exists box_type text not null default 'general';

create or replace function public.rarity_rank(p_rarity text)
returns integer
language sql
immutable
as $$
  select case lower(coalesce(trim(p_rarity), 'common'))
    when 'common' then 1
    when 'uncommon' then 2
    when 'rare' then 3
    when 'epic' then 4
    when 'legendary' then 5
    else 1
  end;
$$;

create or replace function public.rarity_at_most(p_item_rarity text, p_box_rarity text)
returns boolean
language sql
immutable
as $$
  select public.rarity_rank(p_item_rarity) <= public.rarity_rank(p_box_rarity);
$$;

create or replace function public.loot_gold_qty(p_box_rarity text)
returns integer
language plpgsql
immutable
as $$
declare
  v_rank integer := public.rarity_rank(p_box_rarity);
begin
  return case v_rank
    when 1 then 5 + floor(random() * 11)::int   -- 5–15
    when 2 then 15 + floor(random() * 16)::int  -- 15–30
    when 3 then 30 + floor(random() * 31)::int  -- 30–60
    when 4 then 60 + floor(random() * 41)::int  -- 60–100
    else 100 + floor(random() * 101)::int      -- 100–200
  end;
end;
$$;

create or replace function public.loot_pick_item(
  p_box_type text,
  p_box_rarity text
)
returns uuid
language plpgsql
stable
as $$
declare
  v_item_id uuid;
  v_type text := lower(coalesce(trim(p_box_type), 'general'));
begin
  if v_type = 'gold' then
    select i.id
      into v_item_id
    from public.items i
    where coalesce(i.drop_eligible, true) = true
      and lower(i.name) like '%gold%'
    order by random()
    limit 1;
    return v_item_id;
  end if;

  select i.id
    into v_item_id
  from public.items i
  where coalesce(i.drop_eligible, true) = true
    and public.rarity_at_most(coalesce(i.rarity, 'common'), p_box_rarity)
    and case v_type
      when 'weapon' then i.slot in ('weapon', 'offhand')
      when 'armor' then i.slot in ('head', 'chest', 'legs', 'hands', 'feet')
      when 'consumable' then i.slot is null and lower(i.name) not like '%gold%'
      when 'trinket' then i.slot = 'trinket'
      else true
    end
  order by random()
  limit 1;

  return v_item_id;
end;
$$;

create or replace function public.loot_box_label(
  p_box_type text,
  p_box_rarity text
)
returns text
language sql
immutable
as $$
  select initcap(coalesce(nullif(trim(p_box_type), ''), 'general'))
    || ' '
    || initcap(coalesce(nullif(trim(p_box_rarity), ''), 'common'))
    || ' Box';
$$;

create or replace function public.rpc_give_and_seed_loot_box(
  p_character_id uuid,
  p_box_rarity text default 'common',
  p_box_type text default 'general'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_box_id uuid;
  v_item_id uuid;
  v_type text := lower(coalesce(nullif(trim(p_box_type), ''), 'general'));
  v_rarity text := lower(coalesce(nullif(trim(p_box_rarity), ''), 'common'));
  v_qty integer := 1;
  v_label text;
begin
  if p_character_id is null then
    raise exception 'Character id is required';
  end if;

  if not exists (select 1 from public.characters c where c.id = p_character_id) then
    raise exception 'Character not found';
  end if;

  v_item_id := public.loot_pick_item(v_type, v_rarity);

  if v_type = 'gold' then
    v_qty := public.loot_gold_qty(v_rarity);
  end if;

  v_label := public.loot_box_label(v_type, v_rarity);

  insert into public.loot_boxes (
    character_id,
    rarity,
    box_type,
    label,
    status,
    contents
  )
  values (
    p_character_id,
    v_rarity,
    v_type,
    v_label,
    'unopened',
    jsonb_build_object(
      'items',
      jsonb_build_array(
        jsonb_strip_nulls(
          jsonb_build_object(
            'item_id', v_item_id,
            'qty', v_qty,
            'drop_rarity', v_rarity,
            'box_type', v_type
          )
        )
      )
    )
  )
  returning id into v_box_id;

  return v_box_id;
end;
$$;

create or replace function public.rpc_open_seeded_loot_box(
  p_loot_box_id uuid,
  p_auto_grant boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_box public.loot_boxes%rowtype;
  v_item jsonb;
  v_item_id uuid;
  v_qty integer;
  v_results jsonb := '[]'::jsonb;
  v_name text;
  v_base_rarity text;
  v_ability_name text;
  v_existing_qty integer;
begin
  select *
    into v_box
  from public.loot_boxes
  where id = p_loot_box_id
  for update;

  if not found then
    raise exception 'Loot box not found';
  end if;

  if lower(coalesce(v_box.status, '')) = 'opened' then
    raise exception 'Loot box already opened';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(v_box.contents -> 'items', '[]'::jsonb))
  loop
    v_item_id := nullif(v_item ->> 'item_id', '')::uuid;
    v_qty := greatest(1, coalesce((v_item ->> 'qty')::integer, 1));

    if v_item_id is not null then
      select i.name, coalesce(i.rarity, 'common'), a.name
        into v_name, v_base_rarity, v_ability_name
      from public.items i
      left join public.abilities a on a.id = i.ability_id
      where i.id = v_item_id;

      if p_auto_grant then
        select ci.qty
          into v_existing_qty
        from public.character_items ci
        where ci.character_id = v_box.character_id
          and ci.item_id = v_item_id
        limit 1;

        if found then
          update public.character_items
          set qty = coalesce(v_existing_qty, 0) + v_qty
          where character_id = v_box.character_id
            and item_id = v_item_id;
        else
          insert into public.character_items (character_id, item_id, qty)
          values (v_box.character_id, v_item_id, v_qty);
        end if;
      end if;
    else
      v_name := coalesce(v_item ->> 'item_name', 'Unknown item');
      v_base_rarity := coalesce(v_item ->> 'drop_rarity', v_box.rarity, 'common');
      v_ability_name := null;
    end if;

    v_results := v_results || jsonb_build_array(
      jsonb_strip_nulls(
        jsonb_build_object(
          'item_id', v_item_id,
          'item_name', v_name,
          'qty', v_qty,
          'drop_rarity', coalesce(v_item ->> 'drop_rarity', v_box.rarity),
          'base_rarity', v_base_rarity,
          'ability', case
            when v_ability_name is not null then jsonb_build_object('name', v_ability_name)
            else null
          end
        )
      )
    );
  end loop;

  update public.loot_boxes
  set
    status = 'opened',
    opened_at = now(),
    contents = coalesce(contents, '{}'::jsonb) || jsonb_build_object('revealed', v_results)
  where id = p_loot_box_id;

  return v_results;
end;
$$;

revoke all on function public.rarity_rank(text) from public;
revoke all on function public.rarity_at_most(text, text) from public;
revoke all on function public.loot_gold_qty(text) from public;
revoke all on function public.loot_pick_item(text, text) from public;
revoke all on function public.loot_box_label(text, text) from public;

grant execute on function public.rpc_give_and_seed_loot_box(uuid, text, text) to authenticated;
grant execute on function public.rpc_open_seeded_loot_box(uuid, boolean) to authenticated;

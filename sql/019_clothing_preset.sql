-- Per-character clothing layer labels (player sheets show labels only, not a template id).
-- DM picks a template when editing a character; labels are stored as jsonb.
-- Run in Supabase SQL Editor.

alter table public.characters
  add column if not exists clothing_layers jsonb;

comment on column public.characters.clothing_layers is
  'Ordered [{key, label}] for clothing slot view. Set by DM only.';

-- Default: legs, underwear, shirt, socks, extra
update public.characters
set clothing_layers = '[
  {"key":"legs","label":"Legs"},
  {"key":"hands","label":"Underwear"},
  {"key":"chest","label":"Shirt"},
  {"key":"feet","label":"Socks"},
  {"key":"head","label":"Extra"}
]'::jsonb
where clothing_layers is null;

-- Rename legacy label if an earlier migration used Undershirt
update public.characters
set clothing_layers = (
  select jsonb_agg(
    case
      when elem->>'key' = 'head' and elem->>'label' = 'Undershirt'
        then jsonb_set(elem, '{label}', '"Extra"'::jsonb)
      else elem
    end
    order by ordinality
  )
  from jsonb_array_elements(clothing_layers) with ordinality as t(elem, ordinality)
)
where clothing_layers @> '[{"key":"head","label":"Undershirt"}]'::jsonb;

-- Drop legacy column if an earlier draft added it
alter table public.characters
  drop column if exists clothing_preset;

-- Refresh PostgREST schema cache (fixes "column does not exist" right after migration)
notify pgrst, 'reload schema';

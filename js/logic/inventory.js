// /js/logic/inventory.js
(function (App) {
  App.Logic = App.Logic || {};
  App.Logic.inventory = App.Logic.inventory || {};

  const VALID_SLOTS = new Set([
    null,
    'weapon',
    'offhand',
    'head',
    'chest',
    'legs',
    'hands',
    'feet',
    'trinket',
  ]);
  const ARMOR_SLOTS = new Set(['head', 'chest', 'legs', 'hands', 'feet']);

  function normSlot(slot) {
    if (!slot) return null;
    const s = String(slot).toLowerCase().trim();
    return VALID_SLOTS.has(s) ? s : null;
  }

  // Non-equip path (slot=null)
  App.Logic.inventory.findOrCreateNonEquipByName = async function (sb, name) {
    const clean = (name || '').trim();
    if (!clean) return { error: 'Empty name' };

    const { data, error } = await sb
      .from('items')
      .select('id,name,slot')
      .eq('name', clean)
      .is('slot', null)
      .maybeSingle();

    if (!error && data?.id) return { item: data };
    if (error && error.code !== 'PGRST116') return { error: error.message };

    const { data: ins, error: insErr } = await sb
      .from('items')
      .insert({
        name: clean,
        slot: null,
        created_by: AppState?.user?.id || null,
      })
      .select('id,name,slot')
      .single();
    if (insErr) return { error: insErr.message };
    return { item: ins };
  };

  // Equippable path (slot + armor/weapon)
  App.Logic.inventory.findOrCreateEquippableByAttrs = async function (
    sb,
    { name, slot, kind, damage, armor_value, notes }
  ) {
    const clean = (name || '').trim();
    const s = normSlot(slot);
    if (!clean) return { error: 'Empty name' };
    if (!s) return { error: 'Invalid slot' };

    // Normalize payload to your columns
    const payload = {
      name: clean,
      slot: s,
      damage: null,
      armor_value: null,
      notes: (notes || '').trim() || null,
      created_by: AppState?.user?.id || null,
    };

    if (kind === 'weapon') {
      payload.damage = (damage || '').toString().trim() || null; // allow "1d6+1"
      payload.armor_value = null;
    } else if (kind === 'armor') {
      payload.damage = null;
      payload.armor_value = Math.max(0, Number(armor_value || 0)) || 0;
    } else {
      // “other” equippable (e.g., trinket)
      payload.damage = (damage || '').toString().trim() || null;
      const av = Number(armor_value || 0);
      payload.armor_value = Number.isFinite(av) ? Math.max(0, av) : null;
    }

    // Try to reuse an item with same name+slot (+ same damage/armor if provided)
    const { data: found, error: findErr } = await sb
      .from('items')
      .select('id,name,slot,damage,armor_value')
      .eq('name', clean)
      .eq('slot', s);

    if (findErr) return { error: findErr.message };

    const exact = (found || []).find(
      (it) =>
        (payload.damage == null
          ? true
          : String(it.damage || '') === String(payload.damage)) &&
        (payload.armor_value == null
          ? true
          : Number(it.armor_value || 0) === Number(payload.armor_value))
    );
    if (exact) return { item: exact };

    // Insert new item definition
    const { data: ins, error: insErr } = await sb
      .from('items')
      .insert(payload)
      .select('id,name,slot,damage,armor_value')
      .single();
    if (insErr) return { error: insErr.message };
    return { item: ins };
  };

  // Add/remove quantity in character_items
  App.Logic.inventory.addById = async function (
    sb,
    characterId,
    itemId,
    delta
  ) {
    const n = Number(delta || 0);
    if (!n) return;

    const { data: existing } = await sb
      .from('character_items')
      .select('id,qty')
      .eq('character_id', characterId)
      .eq('item_id', itemId)
      .maybeSingle();

    if (existing?.id) {
      const next = Math.max(0, Number(existing.qty || 0) + n);
      if (next === 0) {
        await sb.from('character_items').delete().eq('id', existing.id);
      } else {
        await sb
          .from('character_items')
          .update({ qty: next })
          .eq('id', existing.id);
      }
      return;
    }

    if (n > 0) {
      await sb.from('character_items').insert({
        character_id: characterId,
        item_id: itemId,
        qty: n,
      });
    }
  };
})(window.App || (window.App = {}));

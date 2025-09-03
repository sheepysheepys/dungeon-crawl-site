// /js/logic/inventory.js
(function (App) {
  App.Logic = App.Logic || {};

  async function addById(sb, chId, itemId, delta) {
    const { data: line } = await sb
      .from('character_items')
      .select('id, qty')
      .eq('character_id', chId)
      .eq('item_id', itemId)
      .maybeSingle();
    if (line) {
      const next = Math.max(0, (+line.qty || 0) + delta);
      if (next === 0)
        await sb.from('character_items').delete().eq('id', line.id);
      else
        await sb
          .from('character_items')
          .update({ qty: next })
          .eq('id', line.id);
    } else if (delta > 0) {
      await sb
        .from('character_items')
        .insert({ character_id: chId, item_id: itemId, qty: delta });
    }
  }

  async function findOrCreateNonEquipByName(sb, name) {
    const n = (name || '').trim();
    if (!n) return { item: null, error: 'Enter an item name.' };
    let { data: exact } = await sb
      .from('items')
      .select('id,name,slot')
      .eq('name', n)
      .maybeSingle();
    if (!exact) {
      const { data: likeRows } = await sb
        .from('items')
        .select('id,name,slot')
        .ilike('name', n);
      const lower = n.toLowerCase();
      exact =
        (likeRows || []).find((r) => r.name.toLowerCase() === lower) ||
        (likeRows || []).find((r) => r.slot == null) ||
        null;
    }
    if (exact && exact.slot != null)
      return {
        item: null,
        error: 'That item is equippable. Use the Equip flow.',
      };
    if (!exact) {
      let { data: created, error: createErr } = await sb
        .from('items')
        .insert({ name: n, slot: null })
        .select('id,name,slot')
        .single();
      if (createErr)
        return { item: null, error: 'Cannot create item (RLS). Ask GM/admin.' };
      exact = created;
    }
    return { item: exact, error: null };
  }

  App.Logic.inventory = { addById, findOrCreateNonEquipByName };
})(window.App);

(async function () {
  const supa = window.supabase;
  const $ = (s) => document.querySelector(s);
  const msg = $('#dmMsg');

  // load characters (adjust table/columns to your schema)
  async function loadChars() {
    const { data, error } = await supa
      .from('characters')
      .select('id,name')
      .order('name');
    const sel = $('#dmChar');
    sel.innerHTML = '';
    (data || []).forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name || c.id;
      sel.appendChild(opt);
    });
    if (error) {
      msg.textContent = error.message;
    }
  }

  async function grantAchievement() {
    const character_id = $('#dmChar').value;
    const description = $('#dmDesc').value.trim();
    if (!character_id || !description) {
      msg.textContent = 'Pick a character and enter a description.';
      return;
    }
    const { error } = await supa
      .from('achievements')
      .insert({ character_id, description });
    msg.textContent = error
      ? 'Error: ' + error.message
      : 'Achievement granted.';
    if (!error) $('#dmDesc').value = '';
  }

  async function grantBox() {
    const character_id = $('#dmChar').value;
    const rarity = $('#dmRarity').value;
    const { error } = await supa
      .from('loot_boxes')
      .insert({ character_id, rarity });
    msg.textContent = error
      ? 'Error: ' + error.message
      : `Loot box (${rarity}) granted.`;
  }

  document.addEventListener('DOMContentLoaded', loadChars);
  $('#btnGrantAch').addEventListener('click', grantAchievement);
  $('#btnGrantBox').addEventListener('click', grantBox);
})();

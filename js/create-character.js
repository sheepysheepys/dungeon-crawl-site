import { supabase, requireUser, getRole, logout } from './js/auth.js';

const user = requireUser();
const role = await getRole(user.id);
if (role === 'dm') window.location.href = 'dm-dashboard.html';

document.getElementById('createBtn').addEventListener('click', async () => {
  const name = document.getElementById('charName').value.trim();
  if (!name) return alert('Enter a character name.');

  const { error } = await supabase.from('characters').insert([
    {
      user_id: user.id,
      name,
      level: 1,
      hp_current: 100,
      hp_max: 100,
      armor_hp: 50,
      armor_state: 'intact',
      stripping_stage: 0,
    },
  ]);

  if (error) return alert('Create error: ' + error.message);
  window.location.href = 'character.html';
});

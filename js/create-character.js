import { supabase, getRole, logout, goto } from './auth.js';

const userStr = localStorage.getItem('user');
if (!userStr) goto('login.html');
const user = JSON.parse(userStr);
if (!user?.id) {
  localStorage.removeItem('user');
  goto('login.html');
}

const role = await getRole(user.id);
if (role === 'dm') goto('dm-dashboard.html');

document.getElementById('createBtn').addEventListener('click', async () => {
  const name = document.getElementById('charName').value.trim();
  if (!name) return alert('Please enter a character name.');

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

  if (error) return alert('Error creating character: ' + error.message);
  goto('character.html');
});

document.getElementById('logout-btn').addEventListener('click', logout);

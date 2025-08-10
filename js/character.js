import { supabase, getRole, logout, goto } from './auth.js';

const userStr = localStorage.getItem('user');
if (!userStr) goto('login.html');
const user = JSON.parse(userStr);
if (!user?.id) {
  localStorage.removeItem('user');
  goto('login.html');
}

// DM gate
const role = await getRole(user.id);
if (role === 'dm') goto('dm-dashboard.html');

async function loadCharacter() {
  const { data, error } = await supabase
    .from('characters')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (error || !data) return goto('create-character.html');

  document.getElementById('character-info').innerHTML = `
    <h2>${data.name}</h2>
    <p>Level: ${data.level}</p>
    <p>HP: ${data.hp_current} / ${data.hp_max}</p>
    <p>Armor: ${data.armor_hp} (${data.armor_state})</p>
    <p>Stripping Stage: ${data.stripping_stage}</p>
  `;
}
await loadCharacter();

document.getElementById('logout-btn').addEventListener('click', logout);

import { supabase, requireUser, getRole, logout } from './js/auth.js';

const user = requireUser();
const role = await getRole(user.id);
if (role === 'dm') window.location.href = 'dm-dashboard.html';

async function loadCharacter() {
  const { data, error } = await supabase
    .from('characters')
    .select('*')
    .eq('user_id', user.id)
    .single();
  if (error || !data) return (window.location.href = 'create-character.html');

  // render
  charDiv.innerHTML = `
    <h2>${data.name}</h2>
    <p>Level: ${data.level}</p>
    <p>HP: ${data.hp_current} / ${data.hp_max}</p>
    <p>Armor: ${data.armor_hp} (${data.armor_state})</p>
    <p>Stripping Stage: ${data.stripping_stage}</p>
  `;
}
const charDiv = document.getElementById('character-info');
await loadCharacter();

document.getElementById('logout-btn').addEventListener('click', logout);

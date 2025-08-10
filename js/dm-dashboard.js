import { supabase, requireUser, getRole, logout } from './js/auth.js';

const user = requireUser();
const role = await getRole(user.id);
if (role !== 'dm') window.location.href = 'character.html';

const { data, error } = await supabase.from('characters').select('*');
if (error) console.error(error);
// render list...

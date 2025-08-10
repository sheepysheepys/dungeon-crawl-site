import {
  supabase,
  saveUser,
  ensureProfile,
  getRole,
  routeByRole,
  goto,
} from './auth.js';

const msgBox = document.getElementById('msg');
const emailEl = document.getElementById('email');
const pwEl = document.getElementById('password');
const showMsg = (t) => (msgBox.textContent = t || '');

document.getElementById('login-btn').addEventListener('click', async () => {
  showMsg('');
  const email = emailEl.value.trim();
  const password = pwEl.value;
  if (!email || !password) return showMsg('Enter email and password.');

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) return showMsg('Login error: ' + error.message);

  saveUser(data.user);
  await ensureProfile(data.user.id);
  const role = await getRole(data.user.id);
  routeByRole(role);
});

document.getElementById('signup-btn').addEventListener('click', async () => {
  showMsg('');
  const email = emailEl.value.trim();
  const password = pwEl.value;
  if (!email || !password) return showMsg('Enter email and password.');

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return showMsg('Sign up error: ' + error.message);

  await ensureProfile(data.user.id);
  saveUser(data.user);
  const role = await getRole(data.user.id);
  routeByRole(role);
});

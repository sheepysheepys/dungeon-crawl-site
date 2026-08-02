import {
  supabase,
  getUser,
  ensureProfile,
  getRole,
  routeByRole,
  goto,
} from './auth.js';

const msgBox = document.getElementById('msg');
const emailEl = document.getElementById('email');
const pwEl = document.getElementById('password');
const signupBtn = document.getElementById('signup-btn');
const showMsg = (t) => (msgBox.textContent = t || '');

// Already signed in? Skip the form.
getUser().then((user) => {
  if (user) getRole(user.id).then(routeByRole).catch(() => {});
});

signupBtn?.addEventListener('click', async () => {
  showMsg('');
  const email = emailEl.value.trim();
  const password = pwEl.value;
  if (!email || !password) return showMsg('Enter email and password.');

  signupBtn.disabled = true;
  try {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return showMsg('Sign up error: ' + error.message);

    // With email confirmation enabled there is no session yet, so the profile
    // upsert would fail RLS. Ask the user to confirm instead.
    if (!data.session) {
      return showMsg('Check your email to confirm your account, then log in.');
    }

    await ensureProfile(data.user.id);
    routeByRole(await getRole(data.user.id));
  } catch (e) {
    showMsg('Sign up error: ' + (e?.message || e));
  } finally {
    signupBtn.disabled = false;
  }
});

document.getElementById('to-login')?.addEventListener('click', (e) => {
  e.preventDefault();
  goto('login.html');
});

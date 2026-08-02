import {
  supabase,
  getUser,
  ensureProfile,
  getRole,
  routeByRole,
} from './auth.js';

const msgBox = document.getElementById('msg');
const emailEl = document.getElementById('email');
const pwEl = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');
const formEl = document.getElementById('login-form');
const signedInEl = document.getElementById('signed-in');
const showMsg = (t) => (msgBox.textContent = t || '');

function setBusy(busy) {
  if (loginBtn) loginBtn.disabled = busy;
  if (signupBtn) signupBtn.disabled = busy;
}

async function afterAuth(user) {
  await ensureProfile(user.id);
  routeByRole(await getRole(user.id));
}

// Already signed in? Offer to continue or switch accounts. Redirecting here
// would make this page unreachable, stranding you on whatever role you have.
(async () => {
  const user = await getUser();
  if (!user) return;

  let role = 'unknown';
  try {
    role = await getRole(user.id);
  } catch {
    /* profiles row may not exist yet */
  }

  document.getElementById('signed-in-email').textContent = user.email || user.id;
  document.getElementById('signed-in-role').textContent = role;
  if (formEl) formEl.hidden = true;
  if (signedInEl) signedInEl.hidden = false;

  document
    .getElementById('continue-btn')
    ?.addEventListener('click', () => routeByRole(role));
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.reload();
  });
})();

loginBtn?.addEventListener('click', async () => {
  showMsg('');
  const email = emailEl.value.trim();
  const password = pwEl.value;
  if (!email || !password) return showMsg('Enter email and password.');

  setBusy(true);
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return showMsg('Login error: ' + error.message);
    await afterAuth(data.user);
  } catch (e) {
    showMsg('Login error: ' + (e?.message || e));
  } finally {
    setBusy(false);
  }
});

signupBtn?.addEventListener('click', async () => {
  showMsg('');
  const email = emailEl.value.trim();
  const password = pwEl.value;
  if (!email || !password) return showMsg('Enter email and password.');

  setBusy(true);
  try {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return showMsg('Sign up error: ' + error.message);

    // With email confirmation enabled there is no session yet, so the profile
    // upsert would fail RLS. Ask the user to confirm instead.
    if (!data.session) {
      return showMsg('Check your email to confirm your account, then log in.');
    }
    await afterAuth(data.user);
  } catch (e) {
    showMsg('Sign up error: ' + (e?.message || e));
  } finally {
    setBusy(false);
  }
});

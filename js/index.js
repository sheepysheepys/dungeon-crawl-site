import { supabase, saveUserToLocalStorage } from './auth.js';

const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const message = document.getElementById('message');

// Already logged in? Redirect to character page
const userStr = localStorage.getItem('user');
if (userStr) {
  window.location.href = 'character.html';
}

// Login handler
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    message.textContent = 'Login failed: ' + error.message;
  } else {
    saveUserToLocalStorage(data.user);
    window.location.href = 'character.html';
  }
});

// Signup handler
signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    message.textContent = 'Signup failed: ' + error.message;
  } else {
    saveUserToLocalStorage(data.user);
    window.location.href = 'character.html';
  }
});

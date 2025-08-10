// js/auth.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js';

export const supabase = createClient(
  'https://fqegrllwoskrfcnmzlod.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxZWdybGx3b3NrcmZjbm16bG9kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0ODk1ODEsImV4cCI6MjA3MDA2NTU4MX0.bI0gGkXD8U-C9lhOkWgJ0QN9swx0lLX5rFpVpI_D2DE'
);

const REPO = '/dungeon-crawl-site/';
export const BASE = location.pathname.includes(REPO) ? REPO : '/';

// Safer navigation
export function goto(page) {
  // page like 'login.html', 'character.html'
  window.location.href = `${BASE}${page}`;
}

export const saveUser = (u) => localStorage.setItem('user', JSON.stringify(u));
export const getUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
};

export async function getRole(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data?.role ?? 'player';
}

export async function ensureProfile(userId) {
  const { error } = await supabase
    .from('profiles')
    .upsert(
      { id: userId, role: 'player' },
      { onConflict: 'id', ignoreDuplicates: true }
    );
  if (error && error.code !== '23505') throw error;
}

export async function logout() {
  await supabase.auth.signOut();
  localStorage.removeItem('user');
  goto('login.html');
}

export function routeByRole(role) {
  if (role === 'dm') goto('dm-dashboard.html');
  else goto('character.html');
}

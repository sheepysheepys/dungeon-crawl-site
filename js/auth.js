// js/auth.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js';

const cfg = window.APP_CONFIG;
if (!cfg) {
  throw new Error('[auth] Missing window.APP_CONFIG — load js/config.js first.');
}

export const supabase = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export const BASE = cfg.basePath;

export function goto(page) {
  window.location.href = `${BASE}${page}`;
}

// The Supabase session is the single source of truth for who is logged in.
export async function getUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data?.user ?? null;
}

export async function requireUser() {
  const user = await getUser();
  if (!user) {
    goto('login.html');
    return null;
  }
  return user;
}

export async function getRole(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data?.role ?? 'player';
}

// Returns the user when they hold `role`, otherwise redirects and returns null.
export async function requireRole(role) {
  const user = await requireUser();
  if (!user) return null;

  let actual;
  try {
    actual = await getRole(user.id);
  } catch {
    goto('login.html');
    return null;
  }

  if (actual !== role) {
    routeByRole(actual);
    return null;
  }
  return user;
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
  goto('login.html');
}

export function routeByRole(role) {
  if (role === 'dm') goto('dm.html');
  else goto('character.html');
}

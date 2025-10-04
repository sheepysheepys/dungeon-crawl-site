// /js/supabase-client.js
(function () {
  const url = 'https://fqegrllwoskrfcnmzlod.supabase.co'; // no trailing slash
  const anon =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxZWdybGx3b3NrcmZjbm16bG9kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0ODk1ODEsImV4cCI6MjA3MDA2NTU4MX0.bI0gGkXD8U-C9lhOkWgJ0QN9swx0lLX5rFpVpI_D2DE';

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error(
      '[supabase-client] Supabase JS not loaded. Check script order.'
    );
    window.sb = null;
    return;
  }

  // Detect if localStorage is available (private mode / blocked storage can throw)
  const canUseStorage = (() => {
    try {
      const k = '__sb_test__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch {
      return false;
    }
  })();

  const { createClient } = window.supabase;
  const client = createClient(url, anon, {
    auth: {
      // Avoid cross-tab lock problems when storage is blocked
      persistSession: canUseStorage,
      autoRefreshToken: canUseStorage,
      detectSessionInUrl: false, // page isn’t handling magic-link callback
    },
  });

  window.sb = client;
  window.supabaseClient = client;
})();

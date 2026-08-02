// /js/supabase-client.js
(function () {
  const cfg = window.APP_CONFIG;
  if (!cfg) {
    console.error(
      '[supabase-client] Missing window.APP_CONFIG — load js/config.js first.'
    );
    window.sb = null;
    return;
  }
  const url = cfg.supabaseUrl; // no trailing slash
  const anon = cfg.supabaseAnonKey;

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

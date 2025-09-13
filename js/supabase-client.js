(function () {
  const url = 'https://fqegrllwoskrfcnmzlod.supabase.co';
  const anon =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxZWdybGx3b3NrcmZjbm16bG9kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0ODk1ODEsImV4cCI6MjA3MDA2NTU4MX0.bI0gGkXD8U-C9lhOkWgJ0QN9swx0lLX5rFpVpI_D2DE';

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error(
      '[supabase-client] Supabase JS not loaded. Check the CDN <script> order.'
    );
    window.sb = null;
    return;
  }

  const { createClient } = window.supabase;
  const client = createClient(url, anon, { auth: { persistSession: true } });

  // expose on common globals
  window.sb = client;
  window.supabaseClient = client;
})();

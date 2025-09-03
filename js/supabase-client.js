(function () {
  const url = 'https://fqegrllwoskrfcnmzlod.supabase.co';
  const anon =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxZWdybGx3b3NrcmZjbm16bG9kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0ODk1ODEsImV4cCI6MjA3MDA2NTU4MX0.bI0gGkXD8U-C9lhOkWgJ0QN9swx0lLX5rFpVpI_D2DE';

  // Ensure the CDN loaded correctly
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error(
      '[supabase-client] Supabase JS not loaded. Check the CDN <script> order.'
    );
    window.sb = null;
    return;
  }

  // Create the client ONCE and store it on window.sb
  window.sb = window.supabase.createClient(url, anon);
})();

// /js/config.js
// Load this with a plain (non-deferred) <script> tag so window.APP_CONFIG exists
// before any deferred classic script or ES module runs.
(function () {
  const REPO_PATH = '/dungeon-crawl-site/';
  // The directory-index URL has no trailing slash, so match that shape too.
  const path = window.location.pathname;
  const underRepo =
    path.startsWith(REPO_PATH) || path === REPO_PATH.slice(0, -1);

  window.APP_CONFIG = {
    supabaseUrl: 'https://fqegrllwoskrfcnmzlod.supabase.co',
    supabaseAnonKey:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxZWdybGx3b3NrcmZjbm16bG9kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0ODk1ODEsImV4cCI6MjA3MDA2NTU4MX0.bI0gGkXD8U-C9lhOkWgJ0QN9swx0lLX5rFpVpI_D2DE',
    // Served under /dungeon-crawl-site/ on GitHub Pages, at / when served from the repo root.
    basePath: underRepo ? REPO_PATH : '/',
  };
})();

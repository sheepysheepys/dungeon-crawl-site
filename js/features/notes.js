// /js/features/notes.js
(function (global) {
  const sb = global.sb || global.supabaseClient;
  const $ = (id) => document.getElementById(id);

  async function loadNotes() {
    const ch = global.AppState?.character;
    const ta = $('notes');
    if (!sb || !ch || !ta) return;

    const { data, error } = await sb
      .from('character_notes')
      .select('body')
      .eq('character_id', ch.id)
      .maybeSingle();

    if (!error && data) ta.value = data.body ?? '';
    if (error && error.code !== 'PGRST116')
      console.warn('[notes] load error', error);
  }

  async function saveNotes() {
    const ch = global.AppState?.character;
    const ta = $('notes');
    const btn = $('btnSaveNotes');
    if (!sb || !ch || !ta) return;

    btn && (btn.disabled = true);

    const { error } = await sb
      .from('character_notes')
      .upsert(
        { character_id: ch.id, body: ta.value },
        { onConflict: 'character_id' }
      );

    if (error) console.error('[notes] save error', error);
    btn && (btn.disabled = false);
  }

  function initNotes() {
    const btn = $('btnSaveNotes');
    if (!btn) return;
    if (btn.dataset.notesInit === '1') return; // guard against duplicate binds
    btn.dataset.notesInit = '1';

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation(); // avoid bubbling into any global refresh handlers
      saveNotes();
    });

    // Load when a character is ready / changes
    window.addEventListener('character:ready', loadNotes);
    loadNotes();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNotes, { once: true });
  } else {
    initNotes();
  }

  // Expose for debugging
  global.App = global.App || { Features: {} };
  global.App.Features = global.App.Features || {};
  global.App.Features.notes = { loadNotes, saveNotes };
})(window);

// /js/features/notes.js
(function (App) {
  const PAGE_SIZE = 10; // number of notes to load per page
  let _page = 0;
  let _total = 0;

  // ========== FETCH & RENDER ==========
  async function loadNotes(sb, chId, { append = false } = {}) {
    const wrap = document.getElementById('notesHistory');
    const moreWrap = document.getElementById('notesMoreWrap');
    if (!wrap) return;

    const from = _page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error, count } = await sb
      .from('character_notes')
      .select('id, body, updated_at, updated_by', { count: 'exact' })
      .eq('character_id', chId)
      .order('updated_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.warn('[notes] load error', error);
      wrap.innerHTML = `<div class="muted">Failed to load notes.</div>`;
      return;
    }

    _total = count || 0;

    const frag = document.createDocumentFragment();
    (data || []).forEach((n) => {
      const div = document.createElement('div');
      div.className = 'note-row';
      div.style.padding = '8px 0';
      div.style.borderBottom = '1px solid var(--line2)';
      div.innerHTML = `
        <div>${escapeHtml(n.body)}</div>
        <div class="muted mono" style="font-size:12px; margin-top:2px;">
          ${new Date(n.updated_at).toLocaleString()}
          ${n.updated_by ? ` — ${escapeHtml(n.updated_by)}` : ''}
        </div>`;
      frag.appendChild(div);
    });

    if (append) wrap.appendChild(frag);
    else {
      wrap.innerHTML = '';
      wrap.appendChild(frag);
    }

    // "Load more" visibility
    const loadedCount = (document.querySelectorAll('.note-row') || []).length;
    if (moreWrap) moreWrap.style.display = loadedCount < _total ? '' : 'none';
  }

  // ========== SAVE ==========
  async function saveNote(sb, chId, userEmail) {
    const notesEl = document.getElementById('notes');
    const msgEl = document.getElementById('msg');
    const body = (notesEl?.value || '').trim();
    if (!body) {
      setMsg('Enter a note first.');
      return;
    }

    const { error } = await sb.from('character_notes').insert({
      character_id: chId,
      body,
      updated_by: userEmail || 'unknown',
    });

    if (error) {
      console.error('[notes] save error', error);
      setMsg('Failed to save note.');
      return;
    }

    notesEl.value = '';
    setMsg('Note saved!');
    _page = 0;
    await loadNotes(sb, chId);
  }

  // helper
  function setMsg(s) {
    const msgEl = document.getElementById('msg');
    if (msgEl) msgEl.textContent = s;
  }

  function escapeHtml(s) {
    return String(s || '').replace(
      /[&<>"']/g,
      (m) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        }[m])
    );
  }

  // ========== WIRING ==========
  async function wireNotes(sb, ch) {
    if (!sb || !ch?.id) return;

    const chId = ch.id;
    const email = ch.user_email || window.AppState?.user?.email || null;

    // Save button
    document
      .getElementById('btnSaveNotes')
      ?.addEventListener('click', async () => {
        await saveNote(sb, chId, email);
      });

    // Load more
    document
      .getElementById('btnNotesMore')
      ?.addEventListener('click', async () => {
        _page++;
        await loadNotes(sb, chId, { append: true });
      });

    // Initial load
    _page = 0;
    await loadNotes(sb, chId);
  }

  // ========== EXPORT ==========
  App.Features = App.Features || {};
  App.Features.notes = { wireNotes, loadNotes };
})(window.App || (window.App = {}));

// Wire automatically on character:ready
window.addEventListener('character:ready', async (ev) => {
  const ch = ev.detail;
  const sb = window.sb;
  await window.App.Features.notes.wireNotes(sb, ch);
});

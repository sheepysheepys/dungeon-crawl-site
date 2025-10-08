// /js/features/notes.js
(function (App) {
  const PAGE_SIZE = 10;
  let _page = 0;
  let _total = 0;

  // small helpers
  function setMsg(s) {
    const msgEl = document.getElementById('msg');
    if (msgEl) msgEl.textContent = s || '';
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

  // ========= LOAD =========
  async function loadNotes(sb, chId, currentUserId, { append = false } = {}) {
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

      const who =
        n.updated_by && currentUserId && n.updated_by === currentUserId
          ? ' — you'
          : '';

      div.innerHTML = `
        <div>${escapeHtml(n.body)}</div>
        <div class="muted mono" style="font-size:12px; margin-top:2px;">
          ${new Date(n.updated_at).toLocaleString()}${who}
        </div>`;
      frag.appendChild(div);
    });

    if (append) wrap.appendChild(frag);
    else {
      wrap.innerHTML = '';
      wrap.appendChild(frag);
    }

    // toggle "Load more"
    const loadedCount = (wrap.querySelectorAll('.note-row') || []).length;
    if (moreWrap) moreWrap.style.display = loadedCount < _total ? '' : 'none';
  }

  // ========= SAVE =========
  async function saveNote(sb, chId, user) {
    const notesEl = document.getElementById('notes');
    const body = (notesEl?.value || '').trim();
    if (!body) {
      setMsg('Enter a note first.');
      return;
    }

    const payload = {
      character_id: chId,
      body,
      updated_at: new Date().toISOString(), // client stamp (OK if DB also has default)
      updated_by: user?.id || null, // ✅ UUID, not email
    };

    const { error } = await sb.from('character_notes').insert(payload);
    if (error) {
      console.error('[notes] save error', error);
      setMsg('Failed to save note.');
      return;
    }

    notesEl.value = '';
    setMsg('Note saved!');
    _page = 0;
    await loadNotes(sb, chId, user?.id);
  }

  // ========= WIRING =========
  async function wireNotes(sb, ch) {
    if (!sb || !ch?.id) return;

    // prefer the AppState user (already fetched in character.js); fall back to auth.getUser
    let user = window.AppState?.user || null;
    if (!user?.id) {
      try {
        const { data: { user: u } = {} } = await sb.auth.getUser();
        if (u) user = u;
      } catch {}
    }

    const chId = ch.id;
    const userId = user?.id || null;

    // Save button
    document
      .getElementById('btnSaveNotes')
      ?.addEventListener('click', async () => {
        await saveNote(sb, chId, user);
      });

    // Load more
    document
      .getElementById('btnNotesMore')
      ?.addEventListener('click', async () => {
        _page++;
        await loadNotes(sb, chId, userId, { append: true });
      });

    // Initial load
    _page = 0;
    await loadNotes(sb, chId, userId);
  }

  // ========= EXPORT =========
  App.Features = App.Features || {};
  App.Features.notes = { wireNotes, loadNotes };
})(window.App || (window.App = {}));

// Auto-wire on character ready
window.addEventListener('character:ready', async (ev) => {
  const ch = ev.detail;
  const sb = window.sb;
  await window.App.Features.notes.wireNotes(sb, ch);
});

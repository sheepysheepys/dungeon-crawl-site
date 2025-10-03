// /js/features/experience.js
(function (App) {
  const $xpList = document.getElementById('xpList');

  function escapeHtml(s) {
    return String(s ?? '').replace(
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

  function renderRows(rows) {
    if (!$xpList) return;

    const safeRows = Array.isArray(rows) ? rows : [];
    const filled = safeRows
      .map(
        (xp) => `
      <div class="xp-row">
        <span class="xp-name">${escapeHtml(xp.xp_name)}</span>
        <span class="xp-bonus">+${Number(xp.xp_bonus ?? 0)}</span>
        <span class="xp-notch" aria-hidden="true"></span>
      </div>
    `
      )
      .join('');

    const empties = Array.from({ length: Math.max(0, 4 - safeRows.length) })
      .map(
        () => `
        <div class="xp-row xp-empty">
          <span></span><span></span><span class="xp-notch" aria-hidden="true"></span>
        </div>
      `
      )
      .join('');

    $xpList.innerHTML = (filled || '') + empties;
  }

  async function loadExperiences(sb, chId) {
    if (!$xpList) return;
    $xpList.innerHTML = `
      <div class="xp-row xp-empty">
        <span>Loading…</span><span></span><span class="xp-notch" aria-hidden="true"></span>
      </div>`;

    if (!sb) {
      $xpList.innerHTML = `
        <div class="xp-row xp-empty">
          <span>Missing Supabase client</span><span></span><span class="xp-notch" aria-hidden="true"></span>
        </div>`;
      return;
    }
    if (!chId) {
      $xpList.innerHTML = `
        <div class="xp-row xp-empty">
          <span>No character selected</span><span></span><span class="xp-notch" aria-hidden="true"></span>
        </div>`;
      return;
    }

    try {
      const { data, error } = await sb
        .from('character_experiences')
        .select('id, xp_name, xp_bonus, created_at')
        .eq('character_id', chId)
        .order('created_at', { ascending: true });

      if (error) {
        console.warn('[xp] load error', error);
        $xpList.innerHTML = `
          <div class="xp-row xp-empty">
            <span>Error loading</span><span></span><span class="xp-notch" aria-hidden="true"></span>
          </div>`;
        return;
      }

      renderRows(data || []);
    } catch (e) {
      console.error('[xp] exception load', e);
      $xpList.innerHTML = `
        <div class="xp-row xp-empty">
          <span>Error loading</span><span></span><span class="xp-notch" aria-hidden="true"></span>
        </div>`;
    }
  }

  function subscribeExperiences(sb, chId) {
    if (!sb || !chId) return null;
    const channel = sb
      .channel(`xp-changes-${chId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'character_experiences',
          filter: `character_id=eq.${chId}`,
        },
        async () => {
          await loadExperiences(sb, chId);
        }
      )
      .subscribe((status) => console.log('[xp] realtime status', status));
    return channel;
  }

  App.Features = App.Features || {};
  App.Features.experience = { loadExperiences, subscribeExperiences };
})(window.App || (window.App = {}));

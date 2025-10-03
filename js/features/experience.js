// /js/features/experience.js
(function (App) {
  const $xpList = document.getElementById('xpList');

  function escapeHtml(s) {
    return String(s).replace(
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

  // Renders up to 4 rows; shows empties if fewer
  function renderRows(rows) {
    if (!$xpList) return;

    const filled = rows
      .map(
        (xp) => `
      <div class="xp-row">
        <span class="xp-name">${escapeHtml(xp.xp_name ?? '')}</span>
        <span class="xp-bonus">+${Number(xp.xp_bonus ?? 0)}</span>
        <span class="xp-notch" aria-hidden="true"></span>
      </div>
    `
      )
      .join('');

    const empties = Array.from({ length: Math.max(0, 4 - rows.length) })
      .map(
        () => `
        <div class="xp-row xp-empty">
          <span></span><span></span><span class="xp-notch" aria-hidden="true"></span>
        </div>
      `
      )
      .join('');

    $xpList.innerHTML = filled + empties;
  }

  async function loadExperiences(sb, chId) {
    if (!$xpList || !sb || !chId) return;

    // Skeleton state
    $xpList.innerHTML = `
      <div class="xp-row xp-empty">
        <span>Loading…</span><span></span><span class="xp-notch" aria-hidden="true"></span>
      </div>`;

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
  }

  // Optional: subscribe to realtime changes for the active character
  // Call subscribeExperiences(sb, chId) once per character load.
  function subscribeExperiences(sb, chId) {
    if (!sb || !chId) return null;

    // Clean up previous channel if you manage one globally
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
          // Re-fetch on any insert/update/delete for this character
          await loadExperiences(sb, chId);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // initial sync can be handled here if desired
        }
      });

    return channel;
  }

  App.Features = App.Features || {};
  App.Features.experience = { loadExperiences, subscribeExperiences };
})(window.App || (window.App = {}));

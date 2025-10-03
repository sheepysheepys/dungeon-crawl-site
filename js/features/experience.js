// /js/features/experience.js
(function (App) {
  const $xpList = document.getElementById('xpList');

  async function loadExperiences(sb, chId) {
    if (!$xpList || !sb || !chId) return;

    const { data, error } = await sb
      .from('character_experiences')
      .select('xp_name, xp_bonus')
      .eq('character_id', chId)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('[xp] load error', error);
      $xpList.innerHTML = `<div class="xp-row xp-empty"><span>Error loading</span></div>`;
      return;
    }

    const rows = data || [];
    const filled = rows.map(
      (xp) => `
        <div class="xp-row">
          <span class="xp-name">${xp.xp_name}</span>
          <span class="xp-bonus">+${xp.xp_bonus}</span>
          <span class="xp-notch" aria-hidden="true"></span>
        </div>`
    );

    // Fill up to 4 rows with empties if fewer exist
    const empties = Array.from({ length: Math.max(0, 4 - rows.length) })
      .map(
        () => `
        <div class="xp-row xp-empty">
          <span></span><span></span><span class="xp-notch"></span>
        </div>`
      )
      .join('');

    $xpList.innerHTML = filled.join('') + empties;
  }

  App.Features = App.Features || {};
  App.Features.experience = { loadExperiences };
})(window.App || (window.App = {}));

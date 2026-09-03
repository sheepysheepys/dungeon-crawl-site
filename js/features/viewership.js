// /js/features/viewership.js
// Read-only view of character_viewership. Only DMs can write these numbers.
(function (App) {
  App.Features = App.Features || {};

  // Number(null) is 0, so null has to be rejected before the finite check.
  const isNum = (v) =>
    v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  const fmtCount = (n) => (isNum(n) ? Number(n).toLocaleString() : '—');
  const fmtRank = (n) => (isNum(n) ? `#${Number(n)}` : '—');

  function render(row) {
    const setText = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    };

    setText('vwViewers', fmtCount(row?.viewers));
    setText('vwSubscribers', fmtCount(row?.subscribers));
    setText('vwRank', fmtRank(row?.rank));

    const updated = document.getElementById('vwUpdated');
    if (!updated) return;
    updated.textContent = row?.updated_at
      ? `Updated ${new Date(row.updated_at).toLocaleString()}`
      : 'No viewership data yet.';
  }

  async function load(sb, chId) {
    if (!sb || !chId) return;
    const { data, error } = await sb
      .from('character_viewership')
      .select('viewers, subscribers, rank, updated_at')
      .eq('character_id', chId)
      .maybeSingle();

    if (error) {
      console.warn('[viewership] load failed', error);
      const updated = document.getElementById('vwUpdated');
      if (updated) updated.textContent = 'Could not load viewership.';
      return;
    }
    render(data);
    await App.Features?.flavor?.applyViewershipBadges?.(sb, chId);
  }

  function subscribe(sb, chId) {
    if (!sb || !chId) return null;
    return sb
      .channel('viewership:' + chId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'character_viewership',
          filter: `character_id=eq.${chId}`,
        },
        () => load(sb, chId)
      )
      .subscribe();
  }

  App.Features.viewership = { load, subscribe, render };
})(window.App || (window.App = {}));

window.addEventListener('character:ready', async (ev) => {
  const chId = ev.detail?.id;
  const sb = window.sb;
  if (!sb || !chId) return;

  await window.App.Features.viewership.load(sb, chId);

  window.AppState = window.AppState || {};
  if (window.AppState.viewershipChannel) {
    try {
      sb.removeChannel(window.AppState.viewershipChannel);
    } catch {}
  }
  window.AppState.viewershipChannel = window.App.Features.viewership.subscribe(
    sb,
    chId
  );
});

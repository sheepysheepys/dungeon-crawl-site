// Clothing display — bar vs per-slot view (DM-controlled via app_settings)
(function (App) {
  App.Features = App.Features || {};

  const SETTING_KEY = 'clothing_display';
  const FALLBACK_STORAGE = 'clothingDisplayMode';
  const DEFAULT_LAYERS = [
    { key: 'legs', label: 'Legs' },
    { key: 'hands', label: 'Underwear' },
    { key: 'chest', label: 'Shirt' },
    { key: 'feet', label: 'Socks' },
    { key: 'head', label: 'Extra' },
  ];

  // DM-only templates (never shown on player sheets).
  const TEMPLATES = {
    extra: DEFAULT_LAYERS,
    bra: [
      { key: 'legs', label: 'Legs' },
      { key: 'hands', label: 'Underwear' },
      { key: 'head', label: 'Bra' },
      { key: 'chest', label: 'Shirt' },
      { key: 'feet', label: 'Socks' },
    ],
  };

  let _mode = 'bar';
  let _channel = null;

  function normalizeTemplate(v) {
    return v === 'bra' ? 'bra' : 'extra';
  }

  function getTemplateLayers(template) {
    return TEMPLATES[normalizeTemplate(template)] || DEFAULT_LAYERS;
  }

  function normalizeLayers(layers) {
    if (!Array.isArray(layers) || !layers.length) return DEFAULT_LAYERS;
    const cleaned = layers
      .map((row) => ({
        key: String(row?.key || '').trim(),
        label: String(row?.label || '').trim(),
      }))
      .filter((row) => row.key && row.label);
    return cleaned.length ? cleaned : DEFAULT_LAYERS;
  }

  function inferTemplate(layers) {
    const head = normalizeLayers(layers).find((row) => row.key === 'head');
    return head?.label === 'Bra' ? 'bra' : 'extra';
  }

  function getLabelFromLayers(layers, slotKey) {
    const slot = normalizeLayers(layers).find((row) => row.key === slotKey);
    return slot?.label || slotKey || '—';
  }

  function currentLayers() {
    return normalizeLayers(window.AppState?.character?.clothing_layers);
  }

  function normalizeMode(v) {
    return v === 'slots' ? 'slots' : 'bar';
  }

  function getMode() {
    return _mode;
  }

  function applyViewMode(mode) {
    _mode = normalizeMode(mode);
    const isSlots = _mode === 'slots';
    const bar = document.getElementById('dressViewBar');
    const slots = document.getElementById('dressViewSlots');
    if (bar) bar.hidden = isSlots;
    if (slots) slots.hidden = !isSlots;
  }

  async function fetchMode(sb) {
    if (!sb) {
      try {
        return normalizeMode(localStorage.getItem(FALLBACK_STORAGE));
      } catch {
        return 'bar';
      }
    }
    try {
      const { data, error } = await sb
        .from('app_settings')
        .select('value')
        .eq('key', SETTING_KEY)
        .maybeSingle();
      if (!error && data?.value) return normalizeMode(data.value);
    } catch {}
    try {
      return normalizeMode(localStorage.getItem(FALLBACK_STORAGE));
    } catch {
      return 'bar';
    }
  }

  async function setMode(sb, mode, { persist = true } = {}) {
    const next = normalizeMode(mode);
    applyViewMode(next);
    if (!persist) return next;

    try {
      localStorage.setItem(FALLBACK_STORAGE, next);
    } catch {}

    if (sb) {
      const { error } = await sb.from('app_settings').upsert(
        { key: SETTING_KEY, value: next, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );
      if (error) console.warn('[dress-code] save setting failed', error);
    }
    return next;
  }

  function paintSlotGrid(rows, layers) {
    const root = document.getElementById('dressSlotGrid');
    if (!root) return;

    const slots = normalizeLayers(layers ?? currentLayers());
    const bySlot = Object.fromEntries(
      (rows || [])
        .filter((r) => slots.some((s) => s.key === r.slot))
        .map((r) => [r.slot, r])
    );

    root.innerHTML = slots
      .map(({ key, label }) => {
        const row = bySlot[key];
        const on = Number(row?.exo_left ?? 0) > 0;
        return `<div class="dress-slot ${on ? 'dress-slot--on' : 'dress-slot--off'}">
        <span class="dress-slot-label">${label}</span>
        <span class="dress-slot-pip" aria-label="${on ? 'on' : 'off'}"></span>
      </div>`;
      })
      .join('');
  }

  function onEquipmentPaint(rows) {
    paintSlotGrid(rows, currentLayers());
    applyViewMode(_mode);
  }

  async function refresh(sb) {
    _mode = await fetchMode(sb);
    applyViewMode(_mode);
    return _mode;
  }

  function subscribe(sb) {
    if (!sb || _channel) return;
    try {
      _channel = sb
        .channel('app_settings:clothing')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'app_settings',
            filter: `key=eq.${SETTING_KEY}`,
          },
          async () => {
            await refresh(sb);
          }
        )
        .subscribe();
    } catch (e) {
      console.warn('[dress-code] subscribe failed', e);
    }
  }

  async function init(sb) {
    await refresh(sb);
    subscribe(sb);
  }

  App.Features.dressCode = {
    getMode,
    setMode,
    applyViewMode,
    getTemplateLayers,
    inferTemplate,
    normalizeLayers,
    getLabelFromLayers,
    onEquipmentPaint,
    paintSlotGrid,
    refresh,
    init,
    SETTING_KEY,
    TEMPLATES,
    DEFAULT_LAYERS,
  };

  window.addEventListener('character:ready', async () => {
    const sb = window.sb;
    if (!sb) return;
    await init(sb);
  });
})(window.App || (window.App = {}));

(function () {
  const $ = (id) => document.getElementById(id);

  function setText(id, v) {
    const el = $(id);
    if (el) el.textContent = v === null || v === undefined ? '—' : v;
  }

  function show(el, on) {
    if (el) el.style.display = on ? '' : 'none';
  }

  function fmtDots(n) {
    return n > 0
      ? '●'.repeat(Math.min(5, n)) + '○'.repeat(Math.max(0, 5 - n))
      : '○○○○○';
  }

  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') n.className = v;
      else if (k === 'dataset') Object.assign(n.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function')
        n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    });
    kids
      .filter(Boolean)
      .forEach((k) => n.append(k.nodeType ? k : document.createTextNode(k)));
    return n;
  }

  function listMount(id, nodes) {
    const root = $(id);
    if (!root) return;
    root.innerHTML = '';
    nodes.forEach((n) => root.append(n));
  }

  function setDisplay(id, on) {
    const el = $(id);
    if (!el) {
      console.warn(`[missing DOM] #${id}`);
      return;
    }
    el.style.display = on ? '' : 'none';
  }

  // Expose as globals for now
  window.$ = $;
  window.setText = setText;
  window.show = show;
  window.fmtDots = fmtDots;
  window.el = el;
  window.listMount = listMount;
  window.setDisplay = setDisplay;
})();

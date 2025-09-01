(function (global) {
  // ——— DOM helpers ———
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  // ——— VS Code messaging ———
  function acquire() {
    return typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null;
  }
  function post(vscode, type, payload) {
    if (vscode) vscode.postMessage({ type, ...(payload || {}) });
  }

  // ——— Widgets ———
  /**
   * Универсальное наполнение <select>.
   * items: string[] | {id,label}[] (можно переопределить мапперы).
   */
  function fillSelect(sel, items, opts) {
    const { getValue, getLabel, keepValue, value } = opts || {};
    const cur = sel.value;
    sel.innerHTML = "";
    for (const it of items || []) {
      const v = getValue ? getValue(it) : (typeof it === "string" ? it : (it?.id ?? it?.value ?? ""));
      const l = getLabel ? getLabel(it) : (typeof it === "string" ? it : (it?.label ?? it?.text ?? v));
      const opt = document.createElement("option");
      opt.value = String(v);
      opt.textContent = String(l);
      sel.appendChild(opt);
    }
    const target = value !== undefined ? value : (keepValue ? cur : undefined);
    if (target !== undefined) sel.value = String(target);
    if (!sel.value && sel.options.length) sel.selectedIndex = 0;
  }

  // ——— State ———
  function cssEscapeLite(s) {
    // Полный CSS.escape не нужен — достаточно экранировать кавычки/бэкслеш.
    return String(s).replace(/["'\\]/g, "\\$&");
  }
  /**
   * Простая установка state по ключам:
   *  - если есть element#<key> с .value — присвоить;
   *  - иначе — найти radios по name=<key> и отметить value.
   */
  function setState(state) {
    const s = state || {};
    for (const k of Object.keys(s)) {
      const v = s[k];
      const el = document.getElementById(k);
      if (el && "value" in el) {
        el.value = String(v);
        continue;
      }
      const radios = qsa(`input[type="radio"][name="${cssEscapeLite(k)}"]`);
      if (radios.length) {
        for (const r of radios) {
          if (r && "value" in r && r.value === String(v)) {
            r.checked = true;
          }
        }
      }
    }
  }

  global.UI = { qs, qsa, acquire, post, fillSelect, setState };
})(window);

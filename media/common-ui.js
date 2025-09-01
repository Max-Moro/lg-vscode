(function (global) {
  // ——————————————————— DOM helpers ———————————————————
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  // Create element: h('div', { class:'x', dataset:{k:'v'}, style:{gap:'8px'} }, childOrHtml...)
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    if (props && typeof props === "object") {
      for (const [k, v] of Object.entries(props)) {
        if (v == null) continue;
        if (k === "class" || k === "className") el.className = String(v);
        else if (k === "dataset" && v && typeof v === "object") {
          for (const [dk, dv] of Object.entries(v)) el.dataset[dk] = String(dv);
        } else if (k === "style" && v && typeof v === "object") {
          for (const [sk, sv] of Object.entries(v)) el.style[sk] = sv;
        } else if (k in el) { try { el[k] = v; } catch { el.setAttribute(k, String(v)); } }
        else el.setAttribute(k, String(v));
      }
    }
    for (const ch of children.flat()) {
      if (ch == null) continue;
      el.append(ch.nodeType ? ch : document.createTextNode(String(ch)));
    }
    return el;
  }

  // ——————————————————— Events ———————————————————
  function on(el, type, handler, opts) {
    el.addEventListener(type, handler, opts);
    return () => el.removeEventListener(type, handler, opts);
  }
  // Делегирование: handler(target, event)
  function delegate(root, selector, type, handler, opts) {
    return on(root, type, (ev) => {
      const t = ev.target;
      const match = t && (t.closest ? t.closest(selector) : null);
      if (match && root.contains(match)) handler(match, ev);
    }, opts);
  }
  function once(fn) {
    let called = false;
    return (...a) => { if (!called) { called = true; return fn(...a); } };
  }
  function debounce(fn, ms = 200) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }
  function throttle(fn, ms = 200) {
    let last = 0; let pending;
    return (...a) => {
      const now = Date.now();
      if (now - last >= ms) { last = now; fn(...a); }
      else {
        clearTimeout(pending);
        pending = setTimeout(() => { last = Date.now(); fn(...a); }, ms - (now - last));
      }
    };
  }

  // ——————————————————— VS Code messaging ———————————————————
  function acquire() {
    return typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null;
  }
  function post(vscode, type, payload) {
    if (vscode) vscode.postMessage({ type, ...(payload || {}) });
  }

  // ——————————————————— UI widgets ———————————————————
  /**
   * Наполнение <select>.
   * items: string[] | {id,label}[]
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

  // ——————————————————— State helpers ———————————————————
  function cssEscapeLite(s) { return String(s).replace(/["'\\]/g, "\\$&"); }

  /**
   * Set values by keys:
   *  - element with id=<key> gets .value,
   *  - radio group name=<key> selects radio with value
   */
  function setState(state) {
    const s = state || {};
    for (const k of Object.keys(s)) {
      const v = s[k];
      const el = document.getElementById(k);
      if (el && "value" in el) { el.value = String(v); continue; }
      const radios = qsa(`input[type="radio"][name="${cssEscapeLite(k)}"]`);
      if (radios.length) {
        for (const r of radios) { if ("value" in r && r.value === String(v)) r.checked = true; }
      }
      const checks = qsa(`input[type="checkbox"][name="${cssEscapeLite(k)}"]`);
      if (checks.length && typeof v === "boolean") checks.forEach(ch => ch.checked = !!v);
    }
  }

  /**
   * Get values by keys or auto-discover from DOM:
   * - if keys passed: read id or radio/checkbox by name
   * - if not: collect all [id] inputs/selects/textarea + radio groups
   */
  function getState(keys) {
    const out = {};
    const readKey = (k) => {
      const el = document.getElementById(k);
      if (el && "value" in el) { out[k] = el.type === "checkbox" ? !!el.checked : el.value; return; }
      const radios = qsa(`input[type="radio"][name="${cssEscapeLite(k)}"]`);
      if (radios.length) {
        const hit = radios.find(r => r.checked);
        out[k] = hit ? hit.value : (radios[0] ? radios[0].value : "");
        return;
      }
      const checks = qsa(`input[type="checkbox"][name="${cssEscapeLite(k)}"]`);
      if (checks.length) { out[k] = checks.some(c => c.checked); return; }
    };

    if (Array.isArray(keys) && keys.length) {
      keys.forEach(readKey);
      return out;
    }

    // autodiscover controls with ids
    qsa("input[id], select[id], textarea[id]").forEach((el) => {
      const k = el.id;
      if (!k) return;
      if (el.type === "checkbox") out[k] = !!el.checked;
      else out[k] = el.value;
    });
    // radio groups by name
    const names = new Set(qsa('input[type="radio"][name]').map(r => r.name));
    names.forEach(n => {
      const group = qsa(`input[type="radio"][name="${cssEscapeLite(n)}"]`);
      const hit = group.find(r => r.checked);
      out[n] = hit ? hit.value : (group[0] ? group[0].value : "");
    });
    // checkboxes groups by name → boolean (any checked)
    const cNames = new Set(qsa('input[type="checkbox"][name]').map(r => r.name));
    cNames.forEach(n => {
      const group = qsa(`input[type="checkbox"][name="${cssEscapeLite(n)}"]`);
      out[n] = group.some(ch => ch.checked);
    });
    return out;
  }

  /**
   * Persisted state wrapper over vscode.getState()/setState()
   * Fallback to localStorage if VS Code API is unavailable.
   */
  function stateStore(vscode, key = "__ui_state__") {
    const hasVS = !!(vscode && typeof vscode.getState === "function" && typeof vscode.setState === "function");
    const get = () => {
      if (hasVS) return (vscode.getState() || {});
      try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch { return {}; }
    };
    const set = (obj) => {
      if (hasVS) vscode.setState(obj || {});
      else try { localStorage.setItem(key, JSON.stringify(obj || {})); } catch {}
      return obj || {};
    };
    const merge = (partial) => set({ ...get(), ...(partial || {}) });
    const clear = () => set({});
    return { get, set, merge, clear };
  }

  global.UI = {
    // DOM
    qs, qsa, h,
    // events
    on, delegate, once, debounce, throttle,
    // vscode bridge
    acquire, post,
    // widgets/state
    fillSelect, setState, getState, stateStore,
  };
})(window);

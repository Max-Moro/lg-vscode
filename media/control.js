/* global UI */
(function () {
  const vscode = UI.acquire();

  // ---- unified state cache (session) ----
  const store = UI.stateStore(vscode, "lg.control.uiState");

  // Try to instantly restore last selections (before TS sends data)
  const cached = store.get();
  if (cached && Object.keys(cached).length) {
    UI.setState(cached);
  }



  // ---- actions: one delegated handler for all buttons ----
  UI.delegate(document, "[data-action]", "click", (el) => {
    const type = el.getAttribute("data-action");
    if (!type) return;
    UI.post(vscode, type);
  });

  // ---- state-bound controls (selects, radios) ----
  UI.delegate(document, "[data-state-key]", "change", (el) => {
    const key = el.getAttribute("data-state-key");
    if (!key) return;

    // Radios: читаем через UI.getState для корректной группировки по name
    let value;
    if (el instanceof HTMLInputElement && el.type === "radio") {
      value = UI.getState([key])[key];
    } else {
      value = /** @type {HTMLSelectElement|HTMLInputElement} */(el).value;
    }
    const patch = { [key]: value };
    store.merge(patch);
    UI.post(vscode, "setState", { state: patch });
  });

  // ---- handshake ----
  UI.post(vscode, "init");

  // ---- runtime updates from extension ----
  window.addEventListener("message", (e) => {
    const msg = e.data;
    if (msg?.type === "data") {
      // fill selects with remote lists
      UI.fillSelect(UI.qs("#section"), msg.sections, { value: msg.state.section || "" });
      UI.fillSelect(UI.qs("#template"), msg.contexts, { value: msg.state.template || "" });
      UI.fillSelect(UI.qs("#model"), msg.models || [], {
        getValue: it => (typeof it === "string" ? it : (it?.id ?? "")),
        getLabel: it => (typeof it === "string" ? it : (it?.label ?? it?.id ?? "")),
        value: msg.state.model || ""
      });

      applyState(msg.state);
    } else if (msg?.type === "state") {
      applyState(msg.state);
    } else if (msg?.type === "theme") {
      document.documentElement.dataset.vscodeThemeKind = String(msg.kind);
    }
  });

  function applyState(s) {
    const next = {};
    if (s.section !== undefined) next["section"] = s.section;
    if (s.template !== undefined) next["template"] = s.template;
    if (s.model !== undefined) next["model"] = s.model;
    if (Object.keys(next).length) {
      UI.setState(next);
      store.merge(next); // keep cache in sync with authoritative state
    }
  }
})();

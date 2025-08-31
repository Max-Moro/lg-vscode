/* global acquireVsCodeApi */
(function () {
  const vscode = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null;
  const qs = (s) => document.querySelector(s);
  const qsa = (s) => Array.from(document.querySelectorAll(s));

  const ui = {
    section: qs("#section"),
    template: qs("#template"),
    modeAll: () => qs('input[name="mode"][value="all"]'),
    modeChanges: () => qs('input[name="mode"][value="changes"]'),
    model: qs("#model"),
    btnListing: qs("#btn-listing"),
    btnContext: qs("#btn-context"),
    btnContextStats: qs("#btn-context-stats"),
    btnIncluded: qs("#btn-included"),
    btnStats: qs("#btn-stats"),
    btnStarter: qs("#btn-starter"),
    btnOpenConfig: qs("#btn-open-config"),
    btnDoctor: qs("#btn-doctor"),
    btnResetCache: qs("#btn-reset-cache"),
    btnSettings: qs("#btn-settings"),
  };

  function post(type, payload){ vscode && vscode.postMessage({ type, ...payload }); }

  // Events
  ui.section.addEventListener("change", () => post("setState", { state: { section: ui.section.value }}));
  qsa('input[name="mode"]').forEach(r => r.addEventListener("change", () => {
    const val = document.querySelector('input[name="mode"]:checked').value;
    post("setState", { state: { mode: val }});
  }));
  ui.template.addEventListener("change", () => post("setState", { state: { template: ui.template.value }}));
  ui.model.addEventListener("change", () => post("setState", { state: { model: ui.model.value }}));

  ui.btnListing.addEventListener("click", () => post("generateListing"));
  ui.btnContext.addEventListener("click", () => post("generateContext"));
  ui.btnContextStats.addEventListener("click", () => post("showContextStats"));
  ui.btnIncluded.addEventListener("click", () => post("showIncluded"));
  ui.btnStats.addEventListener("click", () => post("showStats"));
  ui.btnStarter.addEventListener("click", () => post("createStarter"));
  ui.btnOpenConfig.addEventListener("click", () => post("openConfig"));
  ui.btnDoctor.addEventListener("click", () => post("doctor"));
  ui.btnResetCache.addEventListener("click", () => post("resetCache"));
  ui.btnSettings.addEventListener("click", () => post("openSettings"));

  // Init handshake
  post("init");

  // Runtime updates from extension
  window.addEventListener("message", (e) => {
    const msg = e.data;
    if (msg?.type === "data") {
      fillSelect(ui.section, msg.sections);
      fillSelect(ui.template, msg.contexts, msg.state.template || "");
      fillSelect(ui.model, msg.models || [], msg.state.model || "");
      setState(msg.state);
    } else if (msg?.type === "state") {
      setState(msg.state);
    } else if (msg?.type === "theme") {
      document.documentElement.dataset.vscodeThemeKind = String(msg.kind);
    }
  });

  function fillSelect(sel, items, value){
    const cur = sel.value;
    sel.innerHTML = "";
    for (const it of items){
      const opt = document.createElement("option");
      if (typeof it === "string") {
        opt.value = it;
        opt.textContent = it;
      } else if (it && typeof it === "object") {
        opt.value = it.id;
        opt.textContent = it.label;
      }
      sel.appendChild(opt);
    }
    sel.value = (value !== undefined ? value : cur) || (items[0] ?? "");
  }

  function setState(s){
    if (s.section !== undefined) ui.section.value = s.section;
    if (s.template !== undefined) ui.template.value = s.template;
    if (s.model !== undefined) ui.model.value = s.model;
    if (s.mode === "changes") ui.modeChanges().checked = true; else ui.modeAll().checked = true;
  }
})();

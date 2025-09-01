/* global UI */
(function () {
  const vscode = UI.acquire();
  const { qs, qsa } = UI;

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

  const post = (type, payload) => UI.post(vscode, type, payload);

  // Events
  ui.section.addEventListener("change", () => post("setState", { state: { section: ui.section.value }}));
  UI.delegate(document, 'input[name="mode"]', 'change', () => {
    const { mode } = UI.getState(['mode']);
    post("setState", { state: { mode }});
  });
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
      UI.fillSelect(ui.section, msg.sections);
      UI.fillSelect(ui.template, msg.contexts, { value: msg.state.template || "" });
      UI.fillSelect(ui.model, msg.models || [], {
        getValue: it => (typeof it === "string" ? it : (it?.id ?? "")),
        getLabel: it => (typeof it === "string" ? it : (it?.label ?? it?.id ?? "")),
        value: msg.state.model || ""
      });
      setState(msg.state);
    } else if (msg?.type === "state") {
      setState(msg.state);
    } else if (msg?.type === "theme") {
      document.documentElement.dataset.vscodeThemeKind = String(msg.kind);
    }
  });

  function setState(s){
    const next = {};
    if (s.section !== undefined) next["section"] = s.section;
    if (s.template !== undefined) next["template"] = s.template;
    if (s.model !== undefined) next["model"] = s.model;
    if (s.mode !== undefined) next["mode"] = (s.mode === "changes") ? "changes" : "all";
    UI.setState(next);
  }
})();

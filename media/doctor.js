/* global acquireVsCodeApi, LG */
(function () {
  const { esc, fmtInt, hrSize } = LG;
  const vscode = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null;
  const app = document.getElementById("app");
  vscode && vscode.postMessage({ type: "ready" });
  let lastJson = "";
  window.addEventListener("message", (ev) => {
    const msg = ev.data;
    if (msg?.type === "report") {
      lastJson = JSON.stringify(msg.payload ?? {}, null, 2);
      render(msg.payload, msg.bundlePath);
    }
  });

  const lvlIcon = (l) => l==="ok"?"✔️":(l==="warn"?"⚠️":"❌");
  const lvlClass = (l) => l==="ok"?"ok":(l==="warn"?"warn":"bad");
  const lvlLabel = (l) => l==="ok"?"up-to-date":(l==="warn"?"needs attention":"error");
  const findCheck = (checks, name) => checks.find(c => c?.name === name);

  function render(data, bundlePath) {
    const cfg = data.config || {};
    const cache = data.cache || {};
    const env = data.env || {};
    const ctxs = Array.isArray(data.contexts) ? data.contexts : [];
    const checks = Array.isArray(data.checks) ? data.checks : [];

    const migCheck = findCheck(checks, "config.migrations");
    const mig = migCheck
      ? `<span class="pill ${lvlClass(migCheck.level)}">${lvlLabel(migCheck.level)}</span>`
      : `<span class="pill warn">unknown</span>`;
    const cacheState = cache.error ? `<span class="pill bad">error</span>` : (cache.exists ? `<span class="pill ok">ok</span>` : `<span class="pill bad">missing</span>`);

    app.innerHTML = `
      <h2>Listing Generator — Doctor</h2>
      <p class="muted">Tool: <b>${esc(data.tool_version || "unknown")}</b> • Protocol: <b>${esc(data.protocol)}</b> • Root: <span class="monosmall">${esc(data.root)}</span></p>

      <div class="actions">
        <button id="btn-refresh" title="Re-run diagnostics">Refresh</button>
        <button id="btn-rebuild" class="secondary" title="Reset local LG cache and re-run">Rebuild cache</button>
        <button id="btn-bundle" class="secondary" title="Build diagn. bundle (.zip) with lg-cfg and git metadata">Build bundle</button>
        <button id="btn-copy" class="secondary" title="Copy raw JSON to clipboard">Copy JSON</button>
      </div>
      ${bundlePath ? `<p class="note">Bundle: <span class="monosmall">${esc(bundlePath)}</span></p>` : ""}

      <div class="cards">
        <div class="card">
          <h4>Config (lg-cfg)</h4>
          <div class="value">${cfg.exists ? "Present" : "Not found"}</div>
          <div class="muted monosmall">path: ${esc(cfg.path || "")}</div>
          <div class="muted monosmall">current: ${esc(String(cfg.current ?? ""))}, actual: ${esc(String(cfg.actual ?? ""))}</div>
          <div class="muted">Migrations: ${mig}</div>
        </div>
        <div class="card">
          <h4>Cache</h4>
          <div class="value">${cacheState}</div>
          <div class="muted monosmall">path: ${esc(cache.path || "")}</div>
          <div class="muted monosmall">size: ${hrSize(cache.sizeBytes || 0)}, entries: ${fmtInt(cache.entries || 0)}</div>
        </div>
        <div class="card">
          <h4>Contexts</h4>
          <div class="value">${fmtInt(ctxs.length)}</div>
          <div class="muted monosmall">${ctxs.slice(0,6).map(esc).join(", ")}${ctxs.length>6?"…":""}</div>
        </div>
        <div class="card">
          <h4>Environment</h4>
          <div class="value">${esc(env.python || "")}</div>
          <div class="muted monosmall">${esc(env.platform || "")}</div>
        </div>
      </div>

      <div class="section">
        <h3>Checks</h3>
        <table aria-label="Checks">
          <thead>
            <tr><th>Check</th><th>Status</th><th>Details</th></tr>
          </thead>
          <tbody>
            ${checks.map(c => `
              <tr>
                <td class="monosmall">${esc(c.name)}</td>
                <td>${lvlIcon(c.level)}</td>
                <td class="monosmall">${esc(c.details || "")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>

      <div class="row">
        <div class="section">
          <h3>Config details</h3>
          <table>
            <tbody>
              <tr><td>exists</td><td>${cfg.exists ? "yes" : "no"}</td></tr>
              <tr><td>sections</td><td class="monosmall">${(cfg.sections||[]).slice(0,20).join(", ")}${(cfg.sections||[]).length>20?"…":""}</td></tr>
              ${cfg.error ? `<tr><td>error</td><td class="monosmall">${esc(cfg.error)}</td></tr>` : ""}
              ${cfg.last_error ? `<tr><td>last_error</td><td class="monosmall">${esc(cfg.last_error.message || "")}</td></tr>` : ""}
            </tbody>
          </table>
        </div>
        <div class="section">
          <h3>Cache details</h3>
          <table>
            <tbody>
              <tr><td>enabled</td><td>${String(cache.enabled)}</td></tr>
              <tr><td>rebuilt</td><td>${String(cache.rebuilt)}</td></tr>
              ${cache.error ? `<tr><td>error</td><td class="monosmall">${esc(cache.error)}</td></tr>` : ""}
            </tbody>
          </table>
        </div>
      </div>

      ${renderMigrations(cfg)}

      <div class="section">
        <details>
          <summary><span class="kv-summary">Raw JSON</span></summary>
          <textarea class="rawjson">${esc(lastJson)}</textarea>
        </details>
      </div>
    `;

    // Actions
    const $ = (id) => document.getElementById(id);
    $("btn-refresh")?.addEventListener("click", () => vscode && vscode.postMessage({ type: "refresh" }));
    $("btn-rebuild")?.addEventListener("click", () => vscode && vscode.postMessage({ type: "rebuildCache" }));
    $("btn-bundle")?.addEventListener("click", () => vscode && vscode.postMessage({ type: "buildBundle" }));
    $("btn-copy")?.addEventListener("click", () => vscode && vscode.postMessage({ type: "copyJson", text: lastJson }));
  }

  // ------- helpers -------
  function renderMigrations(cfg) {
    const applied = Array.isArray(cfg.applied) ? cfg.applied : [];
    if (!applied.length) return "";
    const rows = (arr) =>
      arr
        .map((m) => `<tr><td class="right monosmall">${esc(String(m.id))}</td><td class="monosmall">${esc(m.title || "")}</td></tr>`)
        .join("");
    return `
      <div class="section">
        <h3>Migrations</h3>
        <div class="row">
          ${applied.length ? `
            <div>
              <h4>Applied (${applied.length})</h4>
              <table>
                <thead><tr><th class="right">#</th><th>Title</th></tr></thead>
                <tbody>${rows(applied)}</tbody>
              </table>
            </div>` : ""}
        </div>
      </div>
    `;
  }
})();

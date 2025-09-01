/* global UI, LG */
(function () {
  const { esc, fmtInt, fmtPct, hrSize } = LG;
  const vscode = UI.acquire();
  const app = document.getElementById("app");

  // Handshake: ask TS side for data
  UI.post(vscode, "ready");
  window.addEventListener("message", (ev) => {
    const msg = ev.data;
    if (msg && msg.type === "runResult") {
      render(msg.payload);
    }
  });

  function pillClass(p) { return p>100?"pill crit":(p>=80?"pill warn":"pill good"); }

  function render(data) {
    // Actions bar: Refresh + Generate
    const total = data.total || {};
    const scope = data.scope || "context";

    let name = "";
    if (scope === "context") {
      name = data.target.startsWith("ctx:") ? data.target.slice(4) : data.target;
    } else if (scope === "section") {
      name = data.target.startsWith("sec:") ? data.target.slice(4) : data.target;
    }
    const scopeLabel = scope === "context" ? "Context" : "Section";
    document.title = `${scopeLabel}: ${name} — Statistics`;

    const hasRendered = typeof total.renderedTokens === "number";
    const renderedTokens = total.renderedTokens || 0;
    const renderedOverhead = total.renderedOverheadTokens || 0;
    const renderedOverheadPct = hasRendered && renderedTokens > 0 ? (100 * renderedOverhead / renderedTokens) : 0;

    // Final / Template overhead (только для context)
    const ctxBlock = scope === "context" ? (data.context || {}) : {};
    const hasFinal = scope === "context" && typeof ctxBlock.finalRenderedTokens === "number";

    const hideSaved = (total.savedTokens ?? 0) === 0;

    const genLabel = scope === "context" ? "Generate Context" : "Generate Listing";
    app.innerHTML = `
      <h2>${esc(scopeLabel)}: ${esc(name)} — Statistics</h2>
      <p class="muted">Scope: <b>${esc(scope)}</b> • Name: <b>${esc(name)}</b> • Model: <b>${esc(data.model)}</b> • Encoder: <b>${esc(data.encoder)}</b> • Ctx limit: <b>${fmtInt(data.ctxLimit)}</b> tokens</p>
      <div class="actions">
        <button id="btn-refresh" title="Re-run stats">Refresh</button>
        <button id="btn-generate" title="Render the final prompt now">${esc(genLabel)}</button>
      </div>

      <div class="cards">
        ${card("Source Data", `
           📦 ${hrSize(total.sizeBytes)}<br/>
           🔤 ${fmtInt(total.tokensRaw)} tokens
        `, "Сырые данные до языковых адаптеров")}

        ${!hideSaved ? card("Processed Data", `
           🔤 ${fmtInt(total.tokensProcessed)}<br/>
           💾 ${fmtInt(total.savedTokens)} <span class="pill good">${fmtPct(total.savedPct)}</span><br/>
           📊 <span class="${pillClass(total.ctxShare)}">${fmtPct(total.ctxShare)}</span>
        `, "После языковых адаптеров: processed, saved, share") : ""}

        ${hasRendered ? card("Rendered Data", `
           🔤 ${fmtInt(renderedTokens)}<br/>
           📐 ${fmtInt(renderedOverhead)}<br/>
           ◔ <span class="pill neutral">${fmtPct(renderedOverheadPct)}</span>
        `, "Рендеринг промта (fences, FILE-метки)") : ""}

        ${hasFinal ? card("Template Overhead", `
           🧩 ${fmtInt(ctxBlock.templateOnlyTokens)}<br/>
           ◔ ${fmtPct(ctxBlock.templateOverheadPct)}
        `, "Оверхед шаблона") : ""}

        ${hasFinal ? card("Final Rendered", `
           🔤 ${fmtInt(ctxBlock.finalRenderedTokens)}<br/>
           📊 <span class="${pillClass(ctxBlock.finalCtxShare)}">${fmtPct(ctxBlock.finalCtxShare)}</span>
        `, "Итоговый размер промта") : ""}
      </div>

      <div class="section">

      <div class="section">
        <h3>Files</h3>
        <div class="filter">
          <label class="muted">Filter:</label>
          <input id="flt" type="search" placeholder="path or ext" />
        </div>
      </div>

      <table aria-label="Per-file stats">
        <thead>
          <tr>
            <th class="sortable" data-key="path"   data-dir-default="asc"   title="Относительный путь файла">Path <span class="arrow">▲▼</span></th>
            <th class="sortable right" data-key="size"   data-dir-default="desc"  title="Размер исходного файла">Size <span class="arrow">▲▼</span></th>
            <th class="sortable right" data-key="raw"    data-dir-default="desc"  title="Tokens Raw (с учётом кратности в context)">Raw <span class="arrow">▲▼</span></th>
            <th class="sortable right" data-key="proc"   data-dir-default="desc"  title="Tokens Processed (с учётом кратности)">Processed <span class="arrow">▲▼</span></th>
            ${!hideSaved ? `
              <th class="sortable right" data-key="saved"  data-dir-default="desc"  title="Экономия в токенах">Saved <span class="arrow">▲▼</span></th>
              <th class="sortable right" data-key="savedp" data-dir-default="desc"  title="Экономия в процентах">Saved% <span class="arrow">▲▼</span></th>
            ` : ""}
            <th class="sortable right" data-key="prompt" data-dir-default="desc"  title="Доля в сумме processed">Prompt% <span class="arrow">▲▼</span></th>
            <th class="sortable right" data-key="ctx"    data-dir-default="desc"  title="Вклад файла в окно модели">Ctx% <span class="arrow">▲▼</span></th>
          </tr>
        </thead>
        <tbody id="stats-body"></tbody>
      </table>
    `;

    // Sorting/filtering
    let sortKey = "proc";
    let sortDir = "desc";
    let filter = "";

    const files = (data.files || []).slice();
    const tbody = document.getElementById("stats-body");
    const ths = Array.from(document.querySelectorAll("th.sortable"));
    const flt = document.getElementById("flt");

    function cmpNum(a, b) { return sortDir === "asc" ? a - b : b - a; }
    function cmpStr(a, b) { const r = String(a).localeCompare(String(b)); return sortDir === "asc" ? r : -r; }

    function sortData() {
      files.sort((a, b) => {
        switch (sortKey) {
          case "path":   return cmpStr(a.path, b.path);
          case "size":   return cmpNum(a.sizeBytes, b.sizeBytes);
          case "raw":    return cmpNum(a.tokensRaw, b.tokensRaw);
          case "proc":   return cmpNum(a.tokensProcessed, b.tokensProcessed);
          case "saved":  return cmpNum(a.savedTokens, b.savedTokens);
          case "savedp": return cmpNum(a.savedPct, b.savedPct);
          case "prompt": return cmpNum(a.promptShare, b.promptShare);
          case "ctx":    return cmpNum(a.ctxShare, b.ctxShare);
          default: return 0;
        }
      });
    }

    function updateHeaders() {
      ths.forEach(th => {
        th.classList.remove("active");
        const key = th.getAttribute("data-key");
        if (key === sortKey) th.classList.add("active");
        const arrow = th.querySelector(".arrow");
        if (arrow) arrow.textContent = sortDir === "asc" ? "▲" : "▼";
      });
    }

    function renderBody() {
      const s = (filter || "").toLowerCase();
      const rows = files.filter(f => {
        if (!s) return true;
        return f.path.toLowerCase().includes(s) || (s.startsWith(".") && f.path.toLowerCase().endsWith(s));
      }).map(f => {
        const warn = (f.ctxShare || 0) > 100 ? " warn" : "";
        return `<tr title="Double-click to copy path" data-path="${esc(f.path)}">
          <td class="monosmall">${esc(f.path)}</td>
          <td class="right">${hrSize(f.sizeBytes)}</td>
          <td class="right">${fmtInt(f.tokensRaw)}</td>
          <td class="right">${fmtInt(f.tokensProcessed)}</td>
          ${!hideSaved ? `
            <td class="right">${fmtInt(f.savedTokens)}</td>
            <td class="right">${(f.savedPct ?? 0).toFixed(1)}%</td>
          ` : ""}
          <td class="right">${(f.promptShare ?? 0).toFixed(1)}%</td>
          <td class="right${warn}">${(f.ctxShare ?? 0).toFixed(1)}%</td>
        </tr>`;
      }).join("");
      const cols = !hideSaved ? 8 : 6;
      tbody.innerHTML = rows || `<tr><td colspan="${cols}" class="muted">No files match the filter.</td></tr>`;
    }

    ths.forEach(th => {
      th.addEventListener("click", () => {
        const key = th.getAttribute("data-key") || "path";
        if (key === sortKey) {
          sortDir = (sortDir === "asc") ? "desc" : "asc";
        } else {
          sortKey = key;
          sortDir = th.getAttribute("data-dir-default") || "asc";
        }
        sortData(); updateHeaders(); renderBody();
      });
    });
    flt && flt.addEventListener("input", (e) => {
      filter = (e.target && e.target.value || "").trim();
      renderBody();
    });

    // initial
    sortData(); updateHeaders(); renderBody();

    // delegate dblclick for copy (CSP-safe)
    tbody.addEventListener("dblclick", (e) => {
      const tr = e.target && /** @type {HTMLElement} */(e.target).closest("tr");
      const p = tr && tr.getAttribute("data-path");
      if (p && navigator.clipboard) navigator.clipboard.writeText(p);
    });

    // Adapter Metrics and Raw JSON (debug)
    const metricsHtml = renderMetaSummary(total.metaSummary) || "";
    const rawJsonHtml = `
      <div class="section">
        <details>
          <summary><span class="kv-summary">Raw JSON</span></summary>
          <textarea class="rawjson">${esc(JSON.stringify(data, null, 2))}</textarea>
        </details>
      </div>`;

    const debugRowHtml = `
      <div class="debug-row">
        ${metricsHtml}
        ${rawJsonHtml}
      </div>`;
    app.insertAdjacentHTML("beforeend", debugRowHtml);

    // Hook refresh button
    const btn = document.getElementById("btn-refresh");
    if (btn) btn.addEventListener("click", () => UI.post(vscode, "refresh"));

    // Hook generate button
    const gen = document.getElementById("btn-generate");
    if (gen) gen.addEventListener("click", () => UI.post(vscode, "generate"));
  }

  function card(title, valueHtml, tooltip) {
    return `<div class="card" title="${esc(tooltip||"")}">
      <h4>${esc(title)}</h4>
      <div class="value">${valueHtml}</div>
    </div>`;
  }

  function renderMetaSummary(meta) {
    if (!meta || !Object.keys(meta).length) return "";

    // Двухуровневая группировка:
    // 1) уровень — языковой адаптер (md, py, ...),
    // 2) уровень — остаток ключа целиком ПОСЛЕ первого "." (например: "removed.sections").
    // Приватные (_*) и нулевые значения скрываем.
    /** @type {Record<string, Array<[string, number]>>} */
    const groups = {};
    for (const [k, v] of Object.entries(meta)) {
      if (k.startsWith("_") || v === 0) continue;
      const dot = k.indexOf(".");
      if (dot <= 0 || dot === k.length - 1) {
        // Если формат неожиданный (без префикса/остатка) — пропустим,
        // чтобы не смешивать с адаптерами.
        continue;
      }
      const prefix = k.slice(0, dot);            // "md"
      const rest   = k.slice(dot + 1);           // "removed.sections"
      if (!groups[prefix]) groups[prefix] = [];
      groups[prefix].push([rest, /** @type {number} */(v)]);
    }

    const prefixes = Object.keys(groups).sort((a, b) => a.localeCompare(b));
    if (!prefixes.length) return "";

    const groupHtml = prefixes.map(prefix => {
      const items = groups[prefix].slice().sort((a, b) => a[0].localeCompare(b[0]));
      const rows = items.map(([name, val]) =>
        `<tr><td class="monosmall">${esc(name)}</td><td class="right">${fmtInt(val)}</td></tr>`
      ).join("");
      const title = prefix.charAt(0).toUpperCase() + prefix.slice(1);
      return `<div class="kv-group"><h4>${esc(title)}</h4><table class="kv"><tbody>${rows}</tbody></table></div>`;
    }).join("");

    return `<div class="section">
      <details>
        <summary><span class="kv-summary">Adapter Metrics</span></summary>
        ${groupHtml}
      </details>
    </div>`;
  }
})();

/* global acquireVsCodeApi */
(function () {
  const vscode = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null;
  const app = document.getElementById("app");

  // Handshake: ask TS side for data
  vscode && vscode.postMessage({ type: "ready" });
  window.addEventListener("message", (ev) => {
    const msg = ev.data;
    if (msg && msg.type === "runResult") {
      render(msg.payload);
    }
  });

  // Helpers
  function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function fmtInt(n) { return (n ?? 0).toLocaleString(); }
  function fmtPct(x) { return (x ?? 0).toFixed(1) + "%"; }
  function hrSize(n) { const u=["bytes","KiB","MiB","GiB"]; let i=0,x=n||0; for(;i<u.length-1&&x>=1024;i++)x/=1024; return i===0?x+" bytes":x.toFixed(1)+" "+u[i]; }
  function pillClass(p) { return p>100?"pill crit":(p>=80?"pill warn":"pill good"); }

  function render(data) {
    const total = data.total || {};
    const scope = data.scope || "context";
    const name = scope === "context" ? (data.context?.templateName || "") : (data.context?.templateName || data.files?.[0]?.section || "");
    const hasRendered = typeof total.renderedTokens === "number";
    const renderedTokens = total.renderedTokens || 0;
    const renderedOverhead = total.renderedOverheadTokens || 0;
    const renderedOverheadPct = hasRendered && renderedTokens > 0 ? (100 * renderedOverhead / renderedTokens) : 0;

    // Final / Template overhead (только для context)
    const ctxBlock = scope === "context" ? (data.context || {}) : {};
    const hasFinal = scope === "context" && typeof ctxBlock.finalRenderedTokens === "number";

    app.innerHTML = `
      <h2>Listing Generator — Statistics</h2>
      <p class="muted">Scope: <b>${esc(scope)}</b> • ${scope==="context"?"Template":"Section"}: <b>${esc(name)}</b> • Model: <b>${esc(data.model)}</b> • Encoder: <b>${esc(data.encoder)}</b> • Ctx limit: <b>${fmtInt(data.ctxLimit)}</b> tokens</p>

      <div class="cards">
        ${card("Source Data", `
           📦 ${hrSize(total.sizeBytes)}<br/>
           🔤 ${fmtInt(total.tokensRaw)} tokens
        `, "Сырые данные до адаптеров")}

        ${card("Processed Data", `
           🔤 ${fmtInt(total.tokensProcessed)}<br/>
           💾 ${fmtInt(total.savedTokens)} <span class="pill good">${fmtPct(total.savedPct)}</span><br/>
           📊 <span class="${pillClass(total.ctxShare)}">${fmtPct(total.ctxShare)}</span>
        `, "После адаптеров: processed, saved, share")}

        ${hasRendered ? card("Rendered Data", `
           🔤 ${fmtInt(renderedTokens)}<br/>
           📐 ${fmtInt(renderedOverhead)}<br/>
           ◔ <span class="pill neutral">${fmtPct(renderedOverheadPct)}</span>
        `, "Рендеринг промта (fences, FILE метки)") : ""}

        ${hasFinal ? card("Template Overhead", `
           🧩 ${fmtInt(ctxBlock.templateOnlyTokens)}<br/>
           ◔ ${fmtPct(ctxBlock.templateOverheadPct)}
        `, "Оверхед шаблона") : ""}

        ${hasFinal ? card("Final Rendered", `
           🔤 ${fmtInt(ctxBlock.finalRenderedTokens)}<br/>
           📊 <span class="${pillClass(ctxBlock.finalCtxShare)}">${fmtPct(ctxBlock.finalCtxShare)}</span>
        `, "Итоговый размер промта") : ""}
      </div>

      ${renderMetaSummary(total.metaSummary)}

      <div class="section">

      <div class="section">
        <h3>Files</h3>
        <div class="filter">
          <label class="muted">Filter:</label>
          <input id="flt" type="search" placeholder="path or ext (e.g. .py)" />
          <span class="muted">Sort by clicking on headers</span>
        </div>
      </div>

      <table aria-label="Per-file stats">
        <thead>
          <tr>
            <th class="sortable" data-key="path"   data-dir-default="asc"   title="Относительный путь файла">Path <span class="arrow">▲▼</span></th>
            <th class="sortable right" data-key="size"   data-dir-default="desc"  title="Размер исходного файла">Size <span class="arrow">▲▼</span></th>
            <th class="sortable right" data-key="raw"    data-dir-default="desc"  title="Tokens Raw (с учётом кратности в context)">Raw <span class="arrow">▲▼</span></th>
            <th class="sortable right" data-key="proc"   data-dir-default="desc"  title="Tokens Processed (с учётом кратности)">Processed <span class="arrow">▲▼</span></th>
            <th class="sortable right" data-key="saved"  data-dir-default="desc"  title="Экономия в токенах">Saved <span class="arrow">▲▼</span></th>
            <th class="sortable right" data-key="savedp" data-dir-default="desc"  title="Экономия в процентах">Saved% <span class="arrow">▲▼</span></th>
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
        return `<tr title="Double-click to copy path" ondblclick="navigator.clipboard.writeText('${esc(f.path)}')">
          <td class="monosmall">${esc(f.path)}</td>
          <td class="right">${hrSize(f.sizeBytes)}</td>
          <td class="right">${fmtInt(f.tokensRaw)}</td>
          <td class="right">${fmtInt(f.tokensProcessed)}</td>
          <td class="right">${fmtInt(f.savedTokens)}</td>
          <td class="right">${(f.savedPct ?? 0).toFixed(1)}%</td>
          <td class="right">${(f.promptShare ?? 0).toFixed(1)}%</td>
          <td class="right${warn}">${(f.ctxShare ?? 0).toFixed(1)}%</td>
        </tr>`;
      }).join("");
      tbody.innerHTML = rows || '<tr><td colspan="8" class="muted">No files match the filter.</td></tr>';
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
  }

  function card(title, valueHtml, tooltip) {
    return `<div class="card" title="${esc(tooltip||"")}">
      <h4>${esc(title)}</h4>
      <div class="value">${valueHtml}</div>
    </div>`;
  }

  function renderMetaSummary(meta) {
    if (!meta || !Object.keys(meta).length) return "";
    const rows = Object.entries(meta).map(([k, v]) =>
      `<tr><td class="monosmall">${esc(k)}</td><td class="right">${fmtInt(v)}</td></tr>`
    ).join("");
    return `<div class="section"><h3>Adapter Metrics (Summary)</h3>
      <table class="kv"><tbody>${rows}</tbody></table></div>`;
  }
})();

/* global LGUI, LG */
(function () {
  const { Events, State } = LGUI;
  const { esc, fmtInt, fmtPct, hrSize } = LG;
  State.getVSCode();
  const app = document.getElementById("app");
  
  let currentTaskText = ""; // local task text state

  // Handshake: ask TS side for data
  State.post("ready");
  window.addEventListener("message", (ev) => {
    const msg = ev.data;
    if (msg && msg.type === "runResult") {
      // obtain task text from message
      if (msg.taskText !== undefined) {
        currentTaskText = msg.taskText;
        const textarea = document.getElementById("statsTaskText");
        if (textarea && textarea instanceof HTMLTextAreaElement) {
          textarea.value = currentTaskText;
        }
      }
      render(msg.payload);
    }
  });

  // Setup task text field after render
  function setupTaskTextField() {
    const textarea = document.getElementById("statsTaskText");
    if (!textarea) return;

    // Set current value
    if (textarea instanceof HTMLTextAreaElement) {
      textarea.value = currentTaskText;
    }

    // Handle input changes
    Events.on(textarea, "input", Events.debounce(() => {
      const newText = textarea instanceof HTMLTextAreaElement ? textarea.value : "";
      currentTaskText = newText;
      // Send update to extension host
      State.post("updateTaskText", { taskText: newText });
    }, 500));
  }

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

    // Final / Template overhead (only for context)
    const ctxBlock = scope === "context" ? (data.context || {}) : {};
    const hasFinal = scope === "context" && typeof ctxBlock.finalRenderedTokens === "number";

    const hideSaved = (total.savedTokens ?? 0) === 0;

    const genLabel = scope === "context" ? "Generate Context" : "Generate Listing";

    // Task field only for contexts (doesn't make sense for sections)
    const taskFieldHtml = scope === "context" ? `
      <div class="task-context-wrapper">
        <textarea
          id="statsTaskText"
          class="lg-chat-input"
          placeholder="Describe current task"
          rows="1"></textarea>
      </div>
    ` : "";

    app.innerHTML = `
      <h2>${esc(scopeLabel)}: ${esc(name)} — Statistics</h2>
      <p class="muted">Scope: <b>${esc(scope)}</b> • Name: <b>${esc(name)}</b> • Tokenizer: <b>${esc(data.tokenizerLib)}</b> • Encoder: <b>${esc(data.encoder)}</b> • Ctx limit: <b>${fmtInt(data.ctxLimit)}</b> tokens</p>

      ${taskFieldHtml}

      <div class="lg-toolbar">
        <button id="btn-send-to-ai" class="lg-btn lg-btn--primary" title="Generate and send to AI provider">Send to AI</button>
        <button id="btn-generate" class="lg-btn" title="Render the final prompt now">${esc(genLabel)}</button>
        <button id="btn-refresh" class="lg-btn" title="Re-run stats">Refresh</button>
      </div>

      <div class="cards">
        ${card("Source Data", `
           📦 ${hrSize(total.sizeBytes)}<br/>
           🔤 ${fmtInt(total.tokensRaw)} tokens
        `, "Raw data before language adapters")}

        ${!hideSaved ? card("Processed Data", `
           🔤 ${fmtInt(total.tokensProcessed)}<br/>
           💾 ${fmtInt(total.savedTokens)} <span class="pill good">${fmtPct(total.savedPct)}</span><br/>
           📊 <span class="${pillClass(total.ctxShare)}">${fmtPct(total.ctxShare)}</span>
        `, "After language adapters: processed, saved, share") : ""}

        ${hasRendered ? card("Rendered Data", `
           🔤 ${fmtInt(renderedTokens)}<br/>
           📐 ${fmtInt(renderedOverhead)}<br/>
           ◔ <span class="pill neutral">${fmtPct(renderedOverheadPct)}</span>
        `, "Prompt rendering (fences, FILE tags)") : ""}

        ${hasFinal ? card("Template Overhead", `
           🧩 ${fmtInt(ctxBlock.templateOnlyTokens)}<br/>
           ◔ ${fmtPct(ctxBlock.templateOverheadPct)}
        `, "Template overhead") : ""}

        ${hasFinal ? card("Final Rendered", `
           🔤 ${fmtInt(ctxBlock.finalRenderedTokens)}<br/>
           📊 <span class="${pillClass(ctxBlock.finalCtxShare)}">${fmtPct(ctxBlock.finalCtxShare)}</span>
        `, "Final prompt size") : ""}
      </div>

      <div class="section">
        <h3>Files</h3>
        <div id="files-table-container"></div>
      </div>
    `;

    // Initialize grouped table
    const columns = [
      {
        key: 'path',
        label: 'Path',
        align: 'left',
        sortable: true,
        sortDirDefault: 'asc',
        title: 'Relative file path'
      },
      {
        key: 'sizeBytes',
        label: 'Size',
        align: 'right',
        sortable: true,
        sortDirDefault: 'desc',
        title: 'Source file size',
        format: (v) => hrSize(v)
      },
      {
        key: 'tokensRaw',
        label: 'Raw',
        align: 'right',
        sortable: true,
        sortDirDefault: 'desc',
        title: 'Tokens Raw (considering multiplicity in context)',
        format: (v) => fmtInt(v)
      },
      {
        key: 'tokensProcessed',
        label: 'Processed',
        align: 'right',
        sortable: true,
        sortDirDefault: 'desc',
        title: 'Tokens Processed (considering multiplicity)',
        format: (v) => fmtInt(v)
      }
    ];

    // Add conditional columns for saved tokens
    if (!hideSaved) {
      columns.push(
        {
          key: 'savedTokens',
          label: 'Saved',
          align: 'right',
          sortable: true,
          sortDirDefault: 'desc',
          title: 'Token savings',
          format: (v) => fmtInt(v)
        },
        {
          key: 'savedPct',
          label: 'Saved%',
          align: 'right',
          sortable: true,
          sortDirDefault: 'desc',
          title: 'Savings percentage',
          format: (v) => fmtPct(v),
          aggregateFormula: (aggregated) => {
            const saved = aggregated.savedTokens;
            const raw = aggregated.tokensRaw;

            if (saved != null && raw != null && raw > 0) {
              return (saved / raw) * 100.0;
            }
            return 0.0;
          }
        }
      );
    }

    // Add remaining columns
    columns.push(
      {
        key: 'promptShare',
        label: 'Prompt%',
        align: 'right',
        sortable: true,
        sortDirDefault: 'desc',
        title: 'Share in processed sum',
        format: (v) => fmtPct(v)
      },
      {
        key: 'ctxShare',
        label: 'Ctx%',
        align: 'right',
        sortable: true,
        sortDirDefault: 'desc',
        title: 'File contribution to model context window',
        format: (v) => fmtPct(v),
        warnIf: (v) => (v || 0) > 100
      }
    );

    // Create table after DOM is ready
    setTimeout(() => {
      const container = document.getElementById('files-table-container');
      if (!container) return;

      const { createGroupedTable } = LGUI;
      // Store table instance for cleanup if needed
      app._filesTable = createGroupedTable(container, {
          columns: columns,
          data: data.files || [],
          onRowClick: (path) => {
              State.post('copy', {text: path});
          }
      });
    }, 0);

    // Adapter Metrics and Raw JSON (debug)
    const metricsHtml = renderMetaSummary(total.metaSummary) || "";
    const rawJsonHtml = `
      <div class="section">
        <details>
          <summary><span class="kv-summary">Raw JSON</span></summary>
          <textarea class="lg-code-viewer">${esc(JSON.stringify(data, null, 2))}</textarea>
        </details>
      </div>`;

    const debugRowHtml = `
      <div class="debug-row">
        ${metricsHtml}
        ${rawJsonHtml}
      </div>`;
    app.insertAdjacentHTML("beforeend", debugRowHtml);

    // Setup task text field
    setupTaskTextField();

    // Hook refresh button
    const btn = document.getElementById("btn-refresh");
    if (btn) Events.on(btn, "click", () => State.post("refresh"));

    // Hook generate button
    const gen = document.getElementById("btn-generate");
    if (gen) Events.on(gen, "click", () => State.post("generate"));
    
    // Hook send to AI button
    const sendBtn = document.getElementById("btn-send-to-ai");
    if (sendBtn) Events.on(sendBtn, "click", () => State.post("sendToAI"));
  }

  function card(title, valueHtml, tooltip) {
    return `<div class="card" title="${esc(tooltip||"")}">
      <h4>${esc(title)}</h4>
      <div class="value">${valueHtml}</div>
    </div>`;
  }

  function renderMetaSummary(meta) {
    if (!meta || !Object.keys(meta).length) return "";

    // Two-level grouping:
    // 1) level — language adapter (md, py, ...),
    // 2) level — remainder of the key after the first "." (e.g.: "removed.sections").
    // Hide private (_*) and zero values.
    /** @type {Record<string, Array<[string, number]>>} */
    const groups = {};
    for (const [k, v] of Object.entries(meta)) {
      if (k.startsWith("_") || v === 0) continue;
      const dot = k.indexOf(".");
      if (dot <= 0 || dot === k.length - 1) {
        // If format is unexpected (no prefix/remainder) — skip it,
        // to avoid mixing with adapters.
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

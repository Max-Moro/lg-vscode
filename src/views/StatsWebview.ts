/**
 * Webview под таблицу статистики. MVP — статический макет.
 * Дальше сюда будем передавать JSON от CLI (--stats --json).
 */
import * as vscode from "vscode";
import { StatsJson } from "../runner/LgLocator";

export async function showStatsWebview(data: StatsJson) {
  const panel = vscode.window.createWebviewPanel(
    "lg.stats",
    "Listing Generator — Stats",
    vscode.ViewColumn.Active,
    { enableScripts: true }
  );

  panel.webview.html = getHtml(data);
}

function getHtml(data: StatsJson) {
  const css = `
    body { font: 12px/1.4 var(--vscode-font-family); color: var(--vscode-foreground); padding: 12px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { padding: 6px 8px; border-bottom: 1px solid var(--vscode-editorIndentGuide-background); }
    th { text-align: left; user-select: none; }
    .muted { color: var(--vscode-descriptionForeground); }
    .warn { color: var(--vscode-editorWarning-foreground); font-weight: 600; }
    th.sortable { cursor: pointer; }
    th.sortable .arrow { opacity: 0.5; margin-left: 6px; }
    th.sortable.active .arrow { opacity: 1; }
    td.right, th.right { text-align: right; }
  `;

  const html = `
    <!doctype html>
    <html><head><meta charset="utf-8"><style>${css}</style></head>
    <body>
      <h2>Listing Generator — Stats</h2>
      <p class="muted">Model: <b>${escapeHtml(data.model)}</b>, Context: ${data.ctxLimit.toLocaleString()} tokens.
      Total tokens: <b>${data.total.tokens.toLocaleString()}</b> (${data.total.ctxShare.toFixed(1)}% of ctx).
      Total size: ${hrSize(data.total.sizeBytes)}.</p>
      <table>
        <thead>
          <tr>
            <th class="sortable" data-key="path"   data-dir-default="asc">Path <span class="arrow">▲▼</span></th>
            <th class="sortable right" data-key="size"   data-dir-default="desc">Size <span class="arrow">▲▼</span></th>
            <th class="sortable right" data-key="tokens" data-dir-default="desc">Tokens <span class="arrow">▲▼</span></th>
            <th class="sortable right" data-key="prompt" data-dir-default="desc">Prompt% <span class="arrow">▲▼</span></th>
            <th class="sortable right" data-key="ctx"    data-dir-default="desc">Ctx% <span class="arrow">▲▼</span></th>
          </tr>
        </thead>
        <tbody id="stats-body"></tbody>
      </table>
      <script>
        // --- Data from extension (embedded) ---
        const DATA = ${JSON.stringify({
          model: data.model,
          ctxLimit: data.ctxLimit,
          total: data.total,
          files: data.files,
        })};

        // Render helpers
        function hrSize(n){const u=["bytes","KiB","MiB","GiB"];let i=0;let x=n;for(;i<u.length-1&&x>=1024;i++)x/=1024;return i===0?x+" bytes":x.toFixed(1)+" "+u[i];}
        function esc(s){return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',\"'\":'&#39;'}[c]));}

        // Sorting state
        let sortKey = "path";
        let sortDir = "asc"; // 'asc' | 'desc'

        function sortData() {
          const cmpNum = (a,b) => (sortDir === "asc" ? a - b : b - a);
          const cmpStr = (a,b) => {
            const res = a.localeCompare(b);
            return sortDir === "asc" ? res : -res;
          };
          DATA.files.sort((a,b) => {
            switch (sortKey) {
              case "path":   return cmpStr(a.path, b.path);
              case "size":   return cmpNum(a.sizeBytes, b.sizeBytes);
              case "tokens": return cmpNum(a.tokens, b.tokens);
              case "prompt": return cmpNum(a.promptShare, b.promptShare);
              case "ctx":    return cmpNum(a.ctxShare, b.ctxShare);
              default: return 0;
            }
          });
        }

        function renderBody() {
          const tbody = document.getElementById("stats-body");
          tbody.innerHTML = DATA.files.map(f => {
            const warn = f.ctxShare > 100 ? " warn" : "";
            return \`<tr>
              <td>\${esc(f.path)}</td>
              <td class="right">\${hrSize(f.sizeBytes)}</td>
              <td class="right">\${f.tokens}</td>
              <td class="right">\${f.promptShare.toFixed(1)}%</td>
              <td class="right\${warn}">\${f.ctxShare.toFixed(1)}%</td>
            </tr>\`;
          }).join("");
        }

        function updateHeaders() {
          document.querySelectorAll("th.sortable").forEach(th => {
            th.classList.remove("active");
            const key = th.getAttribute("data-key");
            if (key === sortKey) th.classList.add("active");
            const arrow = th.querySelector(".arrow");
            if (arrow) arrow.textContent = sortDir === "asc" ? "▲" : "▼";
          });
        }

        function setSort(key) {
          if (key === sortKey) {
            sortDir = (sortDir === "asc") ? "desc" : "asc";
          } else {
            sortKey = key;
            // defaults to CLI-like behaviour
            const th = document.querySelector(\`th.sortable[data-key="\${key}"]\`);
            sortDir = th?.getAttribute("data-dir-default") || "asc";
          }
          sortData();
          updateHeaders();
          renderBody();
        }

        // Init
        document.querySelectorAll("th.sortable").forEach(th => {
          th.addEventListener("click", () => setSort(th.getAttribute("data-key") || "path"));
        });
        // Initial render (CLI default: path asc)
        sortKey = "path"; sortDir = "asc";
        sortData(); updateHeaders(); renderBody();
      </script>
    </body></html>
  `;
  return html;
}

function hrSize(n: number): string {
  const units = ["bytes", "KiB", "MiB", "GiB"];
  let x = n; let i = 0;
  for (; i < units.length - 1 && x >= 1024; i++) x /= 1024;
  return i === 0 ? `${x} bytes` : `${x.toFixed(1)} ${units[i]}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
}

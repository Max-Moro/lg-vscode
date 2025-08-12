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
    th { text-align: left; }
    .muted { color: var(--vscode-descriptionForeground); }
    .warn { color: var(--vscode-editorWarning-foreground); font-weight: 600; }
  `;
  const rows = data.files.map(f => {
    const warn = f.ctxShare > 100 ? " warn" : "";
    return `<tr>
      <td>${escapeHtml(f.path)}</td>
      <td class="right">${hrSize(f.sizeBytes)}</td>
      <td class="right">${f.tokens}</td>
      <td class="right">${f.promptShare.toFixed(1)}%</td>
      <td class="right${warn}">${f.ctxShare.toFixed(1)}%</td>
    </tr>`;
  }).join("");

  const html = `
    <!doctype html>
    <html><head><meta charset="utf-8"><style>${css}</style></head>
    <body>
      <h2>Listing Generator — Stats</h2>
      <p class="muted">Model: <b>${escapeHtml(data.model)}</b>, Context: ${data.ctxLimit.toLocaleString()} tokens.
      Total tokens: <b>${data.total.tokens.toLocaleString()}</b> (${data.total.ctxShare.toFixed(1)}% of ctx).
      Total size: ${hrSize(data.total.sizeBytes)}.</p>
      <table>
        <thead><tr><th>Path</th><th>Size</th><th>Tokens</th><th>Prompt%</th><th>Ctx%</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <script>
        function hrSize(n){const u=["bytes","KiB","MiB","GiB"];let i=0;let x=n;for(;i<u.length-1&&x>=1024;i++)x/=1024;return i===0?x+" bytes":x.toFixed(1)+" "+u[i];}
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

/**
 * Webview под таблицу статистики. MVP — статический макет.
 * Дальше сюда будем передавать JSON от CLI (--stats --json).
 */
import * as vscode from "vscode";
import * as path from "path";

export async function showStatsWebview() {
  const panel = vscode.window.createWebviewPanel(
    "lg.stats",
    "Listing Generator — Stats",
    vscode.ViewColumn.Active,
    { enableScripts: true }
  );

  panel.webview.html = getHtml();
}

function getHtml() {
  const css = `
    body { font: 12px/1.4 var(--vscode-font-family); color: var(--vscode-foreground); padding: 12px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { padding: 6px 8px; border-bottom: 1px solid var(--vscode-editorIndentGuide-background); }
    th { text-align: left; }
    .muted { color: var(--vscode-descriptionForeground); }
    .warn { color: var(--vscode-editorWarning-foreground); font-weight: 600; }
  `;
  const html = `
    <!doctype html>
    <html><head><meta charset="utf-8"><style>${css}</style></head>
    <body>
      <h2>Listing Generator — Stats (Placeholder)</h2>
      <p class="muted">Здесь появится таблица из CLI (--stats --json).</p>
      <table>
        <thead><tr><th>Path</th><th>Size</th><th>Tokens</th><th>Prompt%</th><th>Ctx%</th></tr></thead>
        <tbody>
          <tr><td>src/utils.py</td><td>3.2 KiB</td><td>812</td><td>2.7%</td><td>0.4%</td></tr>
          <tr><td>core/data/big.json</td><td>512.8 KiB</td><td>132900</td><td>45.1%</td><td class="warn">66.5%</td></tr>
        </tbody>
      </table>
    </body></html>
  `;
  return html;
}

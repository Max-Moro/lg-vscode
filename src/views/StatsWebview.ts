/**
 * Webview под таблицу статистики.
 */
import * as vscode from "vscode";
import * as fs from "fs";

import type { RunResult } from "../runner/LgLocator";

export async function showStatsWebview(data: RunResult) {
  const scope = data.scope === "context" ? "Context" : "Section";
  const name = data.target.startsWith("ctx:")
    ? data.target.slice(4)
    : data.target.startsWith("sec:")
    ? data.target.slice(4)
    : data.target;

  const panel = vscode.window.createWebviewPanel(
    "lg.stats",
    `${scope}: ${name} — Statistics`,
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(getExtensionUri(), "media")],
    }
  );

  const extUri = getExtensionUri();
  const media = (p: string) => vscode.Uri.joinPath(extUri, "media", p);
  const cssUri = panel.webview.asWebviewUri(media("stats.css")).toString();
  const jsUri = panel.webview.asWebviewUri(media("stats.js")).toString();
  const htmlTplPath = vscode.Uri.joinPath(extUri, "media", "stats.html");
  const cspSource = panel.webview.cspSource;
  const nonce = makeNonce();

  const rawHtml = fs.readFileSync(htmlTplPath.fsPath, "utf8");
  panel.webview.html = rawHtml
    .replace(/{{cspSource}}/g, cspSource)
    .replace(/{{cssUri}}/g, cssUri)
    .replace(/{{jsUri}}/g, jsUri)
    .replace(/{{nonce}}/g, String(nonce));

  // Рукопожатие: ждём "ready" из браузера и шлём данные
  panel.webview.onDidReceiveMessage((msg) => {
    if (msg?.type === "ready") {
      panel.webview.postMessage({ type: "runResult", payload: data });
    }
  });
}

function getExtensionUri(): vscode.Uri {
  const ext = vscode.extensions.getExtension("your-org.vscode-lg");
  if (!ext) {
    throw new Error("Cannot resolve extension URI (your-org.vscode-lg).");
  }
  return ext.extensionUri;
}

function makeNonce() {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}
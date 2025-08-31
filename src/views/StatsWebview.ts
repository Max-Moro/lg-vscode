/**
 * Webview под таблицу статистики.
 */
import * as vscode from "vscode";
import * as fs from "fs";
import type { RunResult } from "../runner/LgLocator";
import { getVirtualProvider } from "./virtualBus";

export async function showStatsWebview(
  data: RunResult,
  refetch?: () => Promise<RunResult>,
  generate?: () => Promise<string> // returns rendered markdown text
) {
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

  // Текущее содержимое (обновляем после refresh)
  let current: RunResult = data;

  // Рукопожатие: ждём "ready" из браузера и шлём данные
  panel.webview.onDidReceiveMessage((msg) => {
    if (msg?.type === "ready") {
      panel.webview.postMessage({ type: "runResult", payload: current });
    }
  });

  // Refresh handler (по кнопке в webview)
  panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg?.type === "refresh") {
      if (!refetch) {
        vscode.window.showWarningMessage("Refresh is unavailable here.");
        return;
      }
      try {
        const next = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: "LG: Refreshing stats…", cancellable: false },
          () => refetch()
        );
        current = next;
        panel.webview.postMessage({ type: "runResult", payload: current });
      } catch (e: any) {
        vscode.window.showErrorMessage(`LG: ${e?.message || e}`);
      }
    } else if (msg?.type === "generate") {
      if (!generate) {
        vscode.window.showWarningMessage("Generate is unavailable here.");
        return;
      }
      try {
        const text = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: "LG: Rendering…", cancellable: false },
          () => generate()
        );
        // Закрываем вебвью статистики и открываем результат
        const vp = getVirtualProvider();
        const kind = current.scope === "context" ? "context" : "listing";
        const title = current.scope === "context" ? `Context — ${name}.md` : `Listing — ${name}.md`;
        panel.dispose();
        if (vp) {
          await vp.open(kind as any, title, text);
        } else {
          const doc = await vscode.workspace.openTextDocument({ language: "markdown", content: text });
          await vscode.window.showTextDocument(doc, { preview: false });
        }
      } catch (e: any) {
        vscode.window.showErrorMessage(`LG: ${e?.message || e}`);
      }
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
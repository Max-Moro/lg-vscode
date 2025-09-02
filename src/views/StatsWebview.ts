/**
 * Webview под таблицу статистики.
 */
import * as vscode from "vscode";
import { getVirtualProvider } from "./virtualBus";
import { CursorAiService } from "../services/CursorAiService";
import type { RunResult } from "../models/run_result";
import { buildHtml, getExtensionUri, mediaUri } from "../webview/webviewKit";

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

  panel.webview.html = buildHtml(panel.webview, "stats.html", {
    cssUri:      mediaUri(panel.webview, "stats.css"),
    baseCssUri:  mediaUri(panel.webview, "base.css"),
    jsUri:       mediaUri(panel.webview, "stats.js"),
    commonJsUri: mediaUri(panel.webview, "common.js"),
    commonUiJsUri: mediaUri(panel.webview, "common-ui.js"),
  });

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
    } else if (msg?.type === "sendToAI") {
      if (!generate) {
        vscode.window.showWarningMessage("Send to AI is unavailable here.");
        return;
      }
      try {
        const text = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: "LG: Generating for AI…", cancellable: false },
          () => generate()
        );
        // Определяем тип контента и отправляем в Cursor AI
        if (current.scope === "context") {
          await CursorAiService.sendContext(name, text);
        } else {
          const mode = current.target.includes("(") 
            ? current.target.slice(current.target.indexOf("(") + 1, current.target.lastIndexOf(")"))
            : "all";
          await CursorAiService.sendListing(name, mode, text);
        }
      } catch (e: any) {
        vscode.window.showErrorMessage(`LG: ${e?.message || e}`);
      }
    } else if (msg?.type === "copy") {
      try {
        const text = typeof msg.text === "string" ? msg.text : "";
        if (!text) return;
        await vscode.env.clipboard.writeText(text);
        vscode.window.showInformationMessage("Copied to clipboard.");
      } catch (e: any) {
        vscode.window.showErrorMessage(`Copy failed: ${e?.message || e}`);
      }
    }
  });
}

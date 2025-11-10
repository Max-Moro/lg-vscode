/**
 * Webview под таблицу статистики.
 */
import * as vscode from "vscode";
import {getVirtualProvider} from "./virtualBus";
import type {RunResult} from "../models/report";
import {buildHtml, getExtensionUri, lgUiUri, mediaUri} from "../webview/webviewKit";
import {getAiService} from "../extension";
import {ControlStateService} from "../services/ControlStateService";

export async function showStatsWebview(
  context: vscode.ExtensionContext,
  data: RunResult,
  refetch: () => Promise<RunResult>,
  generate: () => Promise<string>
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
    baseCssUri:  mediaUri(panel.webview, "base.css"),
    cssUri:      mediaUri(panel.webview, "stats.css"),
    lgUiCssUri:  lgUiUri(panel.webview, "lg-ui.css"),
    lgUiJsUri:   lgUiUri(panel.webview, "lg-ui.js"),
    jsUri:       mediaUri(panel.webview, "stats.js"),
    commonJsUri: mediaUri(panel.webview, "common.js"),
  });

  // Текущее содержимое (обновляем после refresh)
  let current: RunResult = data;
  const stateService = ControlStateService.getInstance(context);

  // Рукопожатие: ждём "ready" из браузера и шлём данные
  panel.webview.onDidReceiveMessage((msg) => {
    if (msg?.type === "ready") {
      panel.webview.postMessage({
        type: "runResult",
        payload: current,
        taskText: current.scope === "context" ? stateService.getState().taskText : undefined
      });
    }
  });

  // Refresh handler (по кнопке в webview)
  panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg?.type === "refresh") {
      try {
        current = await vscode.window.withProgress(
          {location: vscode.ProgressLocation.Notification, title: "LG: Refreshing stats…", cancellable: false},
          () => refetch()
        );
        panel.webview.postMessage({
          type: "runResult",
          payload: current,
          taskText: current.scope === "context" ? stateService.getState().taskText : undefined
        });
      } catch (e: any) {
        vscode.window.showErrorMessage(`LG: ${e?.message || e}`);
      }
    } else if (msg?.type === "updateTaskText") {
      if (current.scope === "context") {
        const newTaskText = msg.taskText || "";
        await stateService.setState({ taskText: newTaskText }, "stats-webview");
      }
    } else if (msg?.type === "generate") {
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
    } else if (msg?.type === "copy") {
      try {
        const text = typeof msg.text === "string" ? msg.text : "";
        if (!text) return;
        await vscode.env.clipboard.writeText(text);
        vscode.window.showInformationMessage("Copied to clipboard.");
      } catch (e: any) {
        vscode.window.showErrorMessage(`Copy failed: ${e?.message || e}`);
      }
    } else if (msg?.type === "sendToAI") {
      const aiService = getAiService();
      await aiService.generateAndSend(
        () => generate(),
        "LG: Generating content..."
      );
      panel.dispose();
    }
  });
}

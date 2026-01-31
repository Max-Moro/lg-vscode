/**
 * Webview for statistics table.
 */
import * as vscode from "vscode";
import type {RunResult} from "../models/report";
import {buildHtml, getExtensionUri, lgUiUri, mediaUri} from "../webview/webviewKit";
import {getPCEStore} from "../state/store";
import {getCoordinator} from "../state/coordinator";
import {getActionDispatcher} from "../actions";

export async function showStatsWebview(
  context: vscode.ExtensionContext,
  data: RunResult,
  refetch: () => Promise<RunResult>
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
    baseCssUri: mediaUri(panel.webview, "base.css"),
    cssUri: mediaUri(panel.webview, "stats.css"),
    lgUiCssUri: lgUiUri(panel.webview, "lg-ui.css"),
    lgUiJsUri: lgUiUri(panel.webview, "lg-ui.js"),
    jsUri: mediaUri(panel.webview, "stats.js"),
    commonJsUri: mediaUri(panel.webview, "common.js"),
  });

  // Get singletons
  const store = getPCEStore(context);
  const coordinator = getCoordinator();
  const actions = getActionDispatcher();

  // Current content (updated after refresh)
  let current: RunResult = data;

  // Send initial data helper
  const sendData = () => {
    const taskText = current.scope === "context" ? store.getPersistentState().taskText : undefined;
    panel.webview.postMessage({ type: "runResult", payload: current, taskText });
  };

  // Message handler
  panel.webview.onDidReceiveMessage(async (msg) => {
    try {
      switch (msg?.type) {
        case "ready":
          sendData();
          break;

        case "refresh":
          current = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: "LG: Refreshing stats…", cancellable: false },
            () => refetch()
          );
          sendData();
          break;

        case "updateTaskText":
          if (current.scope === "context") {
            // Use coordinator to dispatch command (not direct store update!)
            await coordinator.dispatch({ type: "SET_TASK_TEXT", text: msg.taskText || "" });
          }
          break;

        case "generate":
          panel.dispose();
          if (current.scope === "context") {
            await actions.generateContext();
          } else {
            await actions.generateListing();
          }
          break;

        case "copy":
          {
            const text = typeof msg.text === "string" ? msg.text : "";
            if (text) {
              await vscode.env.clipboard.writeText(text);
              vscode.window.showInformationMessage("Copied to clipboard.");
            }
          }
          break;

        case "sendToAI":
          if (current.scope !== "context") {
            vscode.window.showWarningMessage("Section listings cannot be sent to AI. Use contexts instead.");
            return;
          }
          // Reuse ActionDispatcher's sendToAI - it reads state internally
          await actions.sendToAI();
          panel.dispose();
          break;
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      vscode.window.showErrorMessage(`LG: ${errorMessage}`);
    }
  });
}

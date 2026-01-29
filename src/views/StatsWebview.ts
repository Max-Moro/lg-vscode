/**
 * Webview for statistics table.
 */
import * as vscode from "vscode";
import {getVirtualProvider} from "./virtualBus";
import type {RunResult} from "../models/report";
import {buildHtml, getExtensionUri, lgUiUri, mediaUri} from "../webview/webviewKit";
import {getAiService} from "../extension";
import {ControlStateService} from "../services/ControlStateService";
import {listModeSetsJson} from "../services/CatalogService";

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

  // Extract context name from target for getting mode runs
  const contextName = data.target.startsWith("ctx:")
    ? data.target.slice(4)
    : data.target.startsWith("sec:")
    ? "section"
    : "section";

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

  // Current content (updated after refresh)
  let current: RunResult = data;
  const stateService = ControlStateService.getInstance(context);

  // Handshake: wait for "ready" from browser and send data
  panel.webview.onDidReceiveMessage((msg) => {
    if (msg?.type === "ready") {
      panel.webview.postMessage({
        type: "runResult",
        payload: current,
        taskText: current.scope === "context" ? stateService.getState().taskText : undefined
      });
    }
  });

  // Refresh handler (on button click in webview)
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
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        vscode.window.showErrorMessage(`LG: ${errorMessage}`);
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
        // Close stats webview and open result
        const vp = getVirtualProvider();
        const kind = current.scope === "context" ? "context" : "listing";
        const title = current.scope === "context" ? `Context — ${name}.md` : `Listing — ${name}.md`;
        panel.dispose();
        if (vp) {
          await vp.open(kind as "context" | "listing", title, text);
        } else {
          const doc = await vscode.workspace.openTextDocument({ language: "markdown", content: text });
          await vscode.window.showTextDocument(doc, { preview: false });
        }
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        vscode.window.showErrorMessage(`LG: ${errorMessage}`);
      }
    } else if (msg?.type === "copy") {
      try {
        const text = typeof msg.text === "string" ? msg.text : "";
        if (!text) return;
        await vscode.env.clipboard.writeText(text);
        vscode.window.showInformationMessage("Copied to clipboard.");
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        vscode.window.showErrorMessage(`Copy failed: ${errorMessage}`);
      }
    } else if (msg?.type === "sendToAI") {
      try {
        const aiService = getAiService();
        const currentState = stateService.getState();
        const providerId = currentState.providerId || "";

        if (!providerId) {
          vscode.window.showWarningMessage("No AI provider selected.");
          return;
        }

        const modeSets = await listModeSetsJson(contextName, providerId);
        const runs = stateService.getIntegrationModeRuns(contextName, providerId, modeSets) || "";

        await aiService.generateAndSend(
          () => generate(),
          providerId,
          runs,
          "LG: Generating content..."
        );
        panel.dispose();
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        vscode.window.showErrorMessage(`Failed to send to AI: ${errorMessage}`);
      }
    }
  });
}

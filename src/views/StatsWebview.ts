/**
 * Webview for statistics table.
 */
import * as vscode from "vscode";
import {getVirtualProvider} from "./virtualBus";
import type {RunResult} from "../models/report";
import {buildHtml, getExtensionUri, lgUiUri, mediaUri} from "../webview/webviewKit";
import {getAiService} from "../extension";
import {getPKOStore} from "../state/store";
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
  const store = getPKOStore(context);

  // Handshake: wait for "ready" from browser and send data
  panel.webview.onDidReceiveMessage((msg) => {
    if (msg?.type === "ready") {
      const taskText = current.scope === "context" ? store.getPersistentState().taskText : undefined;
      panel.webview.postMessage({
        type: "runResult",
        payload: current,
        taskText
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
        const taskText = current.scope === "context" ? store.getPersistentState().taskText : undefined;
        panel.webview.postMessage({
          type: "runResult",
          payload: current,
          taskText
        });
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        vscode.window.showErrorMessage(`LG: ${errorMessage}`);
      }
    } else if (msg?.type === "updateTaskText") {
      if (current.scope === "context") {
        const newTaskText = msg.taskText || "";
        await store.updatePersistent({ taskText: newTaskText });
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
      // Send to AI only works for contexts, not sections
      if (current.scope !== "context") {
        vscode.window.showWarningMessage("Section listings cannot be sent to AI. Use contexts instead.");
        return;
      }

      try {
        const aiService = getAiService();
        const persistentState = store.getPersistentState();
        const providerId = persistentState.providerId || "";

        if (!providerId) {
          vscode.window.showWarningMessage("No AI provider selected.");
          return;
        }

        // Extract context name from target (e.g., "ctx:my-context" -> "my-context")
        const contextName = data.target.startsWith("ctx:")
          ? data.target.slice(4)
          : data.target;

        const modeSets = await listModeSetsJson(contextName, providerId);
        const runs = store.getIntegrationModeRuns(contextName, providerId);

        // Validate integration mode (except clipboard)
        if (runs === null && providerId !== "clipboard") {
          vscode.window.showErrorMessage(
            "No integration mode configured for this context and provider.\n" +
            "Run 'Update AI Modes Template' to generate ai-interaction.sec.yaml."
          );
          return;
        }

        await aiService.generateAndSend(
          () => generate(),
          providerId,
          runs ?? "",
          "LG: Generating context..."
        );
        panel.dispose();
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        vscode.window.showErrorMessage(`Failed to send to AI: ${errorMessage}`);
      }
    }
  });
}

/**
 * Control Panel View - Thin WebView lifecycle management
 *
 * Responsibilities:
 * - WebView lifecycle (resolve, dispose)
 * - Message routing between WebView and action modules
 * - ViewModel rendering via store subscription
 */

import * as vscode from "vscode";
import { getStore, getCoordinator, getFileWatcher } from "../bootstrap";
import { GenerationActions, StatsActions, AiActions } from "../actions";
import type { BaseCommand, UIMeta } from "../state-engine";
import { buildViewModel } from "../viewmodel/builder";
import { logDebug, logError } from "../logging/log";
import { Initialize } from "../state-lg/domains/lifecycle";

export class ControlPanelView implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private unsubscribeStore?: () => void;
  private unsubscribeMeta?: () => void;
  private unsubscribeTheme?: () => void;

  constructor() {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.buildHtml(view);

    const store = getStore();
    const coordinator = getCoordinator();

    // Subscribe to store → render ViewModel
    this.unsubscribeStore = store.subscribe((state) => {
      this.postRender(buildViewModel(state));
    });

    // Subscribe to meta (loading state)
    this.unsubscribeMeta = coordinator.subscribeToMeta((meta) => {
      this.postMeta(meta);
    });

    // Subscribe to theme changes (via VS Code API directly)
    const themeDisposable = vscode.window.onDidChangeActiveColorTheme((theme) => {
      this.postTheme(theme.kind);
    });
    this.unsubscribeTheme = () => themeDisposable.dispose();

    // Handle WebView messages
    view.webview.onDidReceiveMessage((msg) => this.handleMessage(msg));

    // Start file watcher and initialize
    getFileWatcher().start();
    void coordinator.dispatch(Initialize.create());

    // Send current theme
    this.postTheme(vscode.window.activeColorTheme.kind);

    // Cleanup on dispose
    view.onDidDispose(() => this.dispose());

    logDebug("[ControlPanelView] Resolved");
  }

  private async handleMessage(msg: Record<string, unknown>): Promise<void> {
    try {
      const type = msg.type as string;
      const coordinator = getCoordinator();

      // Route commands to coordinator
      if (type === "command") {
        await coordinator.dispatch(msg.command as BaseCommand);
        return;
      }

      // Renderer ready → send initial render
      if (type === "rendererReady") {
        this.postRender(buildViewModel(getStore().getState()));
        return;
      }

      // Route actions to action modules
      switch (type) {
        case "generateListing": await GenerationActions.generateListing(); break;
        case "generateContext": await GenerationActions.generateContext(); break;
        case "showContextStats": await StatsActions.showContextStats(); break;
        case "showIncluded": await StatsActions.showIncluded(); break;
        case "showStats": await StatsActions.showSectionStats(); break;
        case "sendToAI": await AiActions.sendToAI(); break;
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      logError(`[ControlPanelView] Message error: ${errorMessage}`);
      vscode.window.showErrorMessage(`LG: ${errorMessage}`);
    }
  }

  // ==================== WebView Communication ====================

  private postRender(viewModel: ReturnType<typeof buildViewModel>): void {
    this.view?.webview.postMessage({ type: "render", viewModel });
  }

  private postMeta(meta: UIMeta): void {
    this.view?.webview.postMessage({ type: "setMeta", meta });
  }

  public postTheme(kind: vscode.ColorThemeKind): void {
    this.view?.webview.postMessage({ type: "theme", kind });
  }

  // ==================== HTML Building ====================

  private buildHtml(view: vscode.WebviewView): string {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { buildHtml, lgUiUri, mediaUri, toWebviewUri } = require("../webview/webviewKit") as typeof import("../webview/webviewKit");
    const codicons = toWebviewUri(view.webview, require.resolve("@vscode/codicons/dist/codicon.css"));
    return buildHtml(view.webview, "control.html", {
      codiconsUri: codicons,
      baseCssUri: mediaUri(view.webview, "base.css"),
      lgUiCssUri: lgUiUri(view.webview, "lg-ui.css"),
      lgUiJsUri: lgUiUri(view.webview, "lg-ui.js"),
      controlCssUri: mediaUri(view.webview, "control.css"),
      controlJsUri: mediaUri(view.webview, "control.js"),
    });
  }

  // ==================== Lifecycle ====================

  private dispose(): void {
    this.unsubscribeStore?.();
    this.unsubscribeMeta?.();
    this.unsubscribeTheme?.();
    logDebug("[ControlPanelView] Disposed");
  }
}

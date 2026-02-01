/**
 * Control Panel View - Thin WebView lifecycle management
 *
 * Responsibilities:
 * - WebView lifecycle (resolve, dispose)
 * - Message routing between WebView and ActionDispatcher
 * - ViewModel rendering via store subscription
 */

import * as vscode from "vscode";
import { getStore, getCoordinator, getDispatcher, getWatchers } from "../bootstrap";
import type { Command, UIMeta } from "../state/types";
import { buildViewModel } from "../viewmodel/builder";
import { logDebug, logError } from "../logging/log";

export class ControlPanelView implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private unsubscribeStore?: () => void;
  private unsubscribeMeta?: () => void;
  private unsubscribeTheme?: () => void;

  constructor() {}

  /**
   * Handle toolbar commands
   */
  public async handleCommand(command: string): Promise<void> {
    const dispatcher = getDispatcher();
    try {
      switch (command) {
        case "refreshCatalogs": await dispatcher.refreshCatalogs(); break;
        case "createStarter": await dispatcher.createStarter(); break;
        case "openConfig": await dispatcher.openConfig(); break;
        case "doctor": await dispatcher.doctor(); break;
        case "resetCache": await dispatcher.resetCache(); break;
        case "openSettings": dispatcher.openSettings(); break;
        case "updateAiModes": await dispatcher.updateAiModes(); break;
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      vscode.window.showErrorMessage(`LG: ${errorMessage}`);
    }
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.buildHtml(view);

    const store = getStore();
    const coordinator = getCoordinator();
    const watchers = getWatchers();

    // Subscribe to store → render ViewModel
    this.unsubscribeStore = store.subscribe((state) => {
      this.postRender(buildViewModel(state));
    });

    // Subscribe to meta (loading state)
    this.unsubscribeMeta = coordinator.subscribeToMeta((meta) => {
      this.postMeta(meta);
    });

    // Subscribe to theme changes
    this.unsubscribeTheme = watchers.themeWatcher.subscribe((kind) => {
      this.postTheme(kind);
    });

    // Handle WebView messages
    view.webview.onDidReceiveMessage((msg) => this.handleMessage(msg));

    // Start watchers and initialize
    watchers.startAll();
    void coordinator.dispatch({ type: "INITIALIZE" });

    // Send current theme
    this.postTheme(watchers.themeWatcher.getCurrentTheme());

    // Cleanup on dispose
    view.onDidDispose(() => this.dispose());

    logDebug("[ControlPanelView] Resolved");
  }

  private async handleMessage(msg: Record<string, unknown>): Promise<void> {
    try {
      const type = msg.type as string;
      const coordinator = getCoordinator();
      const dispatcher = getDispatcher();

      // Route commands to coordinator
      if (type === "command") {
        await coordinator.dispatch(msg.command as Command);
        return;
      }

      // Renderer ready → send initial render
      if (type === "rendererReady") {
        this.postRender(buildViewModel(getStore().getState()));
        return;
      }

      // Route actions to dispatcher
      switch (type) {
        case "generateListing": await dispatcher.generateListing(); break;
        case "generateContext": await dispatcher.generateContext(); break;
        case "showContextStats": await dispatcher.showContextStats(); break;
        case "showIncluded": await dispatcher.showIncluded(); break;
        case "showStats": await dispatcher.showSectionStats(); break;
        case "sendToAI": await dispatcher.sendToAI(); break;
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

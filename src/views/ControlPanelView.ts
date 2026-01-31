/**
 * Control Panel View - Thin WebView lifecycle management
 *
 * Responsibilities:
 * - WebView lifecycle (resolve, dispose)
 * - Message routing between WebView and ActionDispatcher
 * - ViewModel rendering via store subscription
 */

import * as vscode from "vscode";

// State management
import { PCEStateStore, getPCEStore } from "../state/store";
import { getCoordinator, StateCoordinator } from "../state/coordinator";
import { ALL_RULES, setLifecycleDependencies } from "../state/rules";
import { WatcherManager } from "../state/watchers";
import type { Command, UIMeta } from "../state/types";

// Actions
import { initActionDispatcher, ActionDispatcher } from "../actions";

// ViewModel
import { buildViewModel } from "../viewmodel/builder";

// Services
import { VirtualDocProvider } from "./VirtualDocProvider";
import { IncludedTree } from "./IncludedTree";
import { ListingService } from "../services/ListingService";
import { ContextService } from "../services/ContextService";
import { GitService } from "../services/GitService";
import { getAiService } from "../extension";
import { logDebug, logError } from "../logging/log";
import type { RunResult } from "../models/report";

export class ControlPanelView implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private store: PCEStateStore;
  private coordinator: StateCoordinator;
  private watcherManager: WatcherManager;
  private actionDispatcher: ActionDispatcher;
  private unsubscribeStore?: () => void;
  private unsubscribeMeta?: () => void;
  private unsubscribeTheme?: () => void;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly vdocs: VirtualDocProvider,
    private readonly included: IncludedTree
  ) {
    // Initialize state management
    this.store = getPCEStore(context);
    this.coordinator = getCoordinator(this.store);

    // Setup lifecycle dependencies for rules
    const aiService = getAiService();
    const gitService = new GitService();
    setLifecycleDependencies({
      detectProviders: () => aiService.detectAvailableProviders(),
      getBranchNames: () => gitService.getBranchNames()
    });

    // Register business rules
    this.coordinator.setRules(ALL_RULES);

    // Initialize watchers
    this.watcherManager = new WatcherManager(this.coordinator);

    // Initialize action dispatcher singleton
    this.actionDispatcher = initActionDispatcher({
      store: this.store,
      coordinator: this.coordinator,
      listingService: new ListingService(context),
      contextService: new ContextService(context),
      aiService,
      vdocs,
      included,
      showStats: async (data: RunResult, refreshFn: () => Promise<RunResult>) => {
        const { showStatsWebview } = await import("./StatsWebview");
        await showStatsWebview(context, data, refreshFn);
      }
    });

    logDebug("[ControlPanelView] Initialized");
  }

  /**
   * Handle toolbar commands
   */
  public async handleCommand(command: string): Promise<void> {
    try {
      switch (command) {
        case "refreshCatalogs": await this.actionDispatcher.refreshCatalogs(); break;
        case "createStarter": await this.actionDispatcher.createStarter(); break;
        case "openConfig": await this.actionDispatcher.openConfig(); break;
        case "doctor": await this.actionDispatcher.doctor(); break;
        case "resetCache": await this.actionDispatcher.resetCache(); break;
        case "openSettings": this.actionDispatcher.openSettings(); break;
        case "updateAiModes": await this.actionDispatcher.updateAiModes(); break;
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

    // Subscribe to store → render ViewModel
    this.unsubscribeStore = this.store.subscribe((state) => {
      this.postRender(buildViewModel(state));
    });

    // Subscribe to meta (loading state)
    this.unsubscribeMeta = this.coordinator.subscribeToMeta((meta) => {
      this.postMeta(meta);
    });

    // Subscribe to theme changes
    this.unsubscribeTheme = this.watcherManager.themeWatcher.subscribe((kind) => {
      this.postTheme(kind);
    });

    // Handle WebView messages
    view.webview.onDidReceiveMessage((msg) => this.handleMessage(msg));

    // Start watchers and initialize
    this.watcherManager.startAll();
    void this.coordinator.dispatch({ type: "INITIALIZE" });

    // Send current theme
    this.postTheme(this.watcherManager.themeWatcher.getCurrentTheme());

    // Cleanup on dispose
    view.onDidDispose(() => this.dispose());
  }

  private async handleMessage(msg: Record<string, unknown>): Promise<void> {
    try {
      const type = msg.type as string;

      // Route commands to coordinator
      if (type === "command") {
        await this.coordinator.dispatch(msg.command as Command);
        return;
      }

      // Renderer ready → send initial render
      if (type === "rendererReady") {
        this.postRender(buildViewModel(this.store.getState()));
        return;
      }

      // Route actions to dispatcher
      switch (type) {
        case "generateListing": await this.actionDispatcher.generateListing(); break;
        case "generateContext": await this.actionDispatcher.generateContext(); break;
        case "showContextStats": await this.actionDispatcher.showContextStats(); break;
        case "showIncluded": await this.actionDispatcher.showIncluded(); break;
        case "showStats": await this.actionDispatcher.showSectionStats(); break;
        case "sendToAI": await this.actionDispatcher.sendToAI(); break;
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
    this.watcherManager.dispose();
    logDebug("[ControlPanelView] Disposed");
  }
}

/**
 * Control Panel View - Thin orchestration layer
 *
 * Responsibilities:
 * - Initialize state management (store, coordinator, rules)
 * - Handle WebView lifecycle
 * - Bridge between state changes and UI rendering
 * - Delegate business actions to services
 */

import * as vscode from "vscode";
import * as path from "path";

// State management
import { PKOStateStore, getPKOStore } from "../state/store";
import { StateCoordinator } from "../state/coordinator";
import { ALL_RULES, setLifecycleDependencies } from "../state/rules";
import type { Command, UIMeta } from "../state/types";

// ViewModel
import { buildViewModel } from "../viewmodel/builder";

// Services
import { VirtualDocProvider } from "./VirtualDocProvider";
import { IncludedTree } from "./IncludedTree";
import { ListingService } from "../services/ListingService";
import { ContextService } from "../services/ContextService";
import { GitService } from "../services/GitService";
import { resetCache, runDoctor } from "../services/DoctorService";
import { openConfigOrInit, runInitWizard } from "../starter/StarterConfig";
import { EXT_ID } from "../constants";
import { getAiService } from "../extension";
import { effectiveWorkspaceRoot } from "../cli/CliResolver";
import { logDebug, logError } from "../logging/log";

export class ControlPanelView implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private store: PKOStateStore;
  private coordinator: StateCoordinator;
  private listingService: ListingService;
  private contextService: ContextService;
  private gitService: GitService;
  private unsubscribeStore?: () => void;
  private unsubscribeMeta?: () => void;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly vdocs: VirtualDocProvider,
    private readonly included: IncludedTree
  ) {
    // Initialize state management
    this.store = getPKOStore(context);
    this.coordinator = new StateCoordinator(this.store);

    // Initialize services
    this.listingService = new ListingService(context);
    this.contextService = new ContextService(context);
    this.gitService = new GitService();

    // Setup lifecycle dependencies for rules
    const aiService = getAiService();
    setLifecycleDependencies({
      detectProviders: () => aiService.detectAvailableProviders(),
      getBranchNames: () => this.gitService.getBranchNames()
    });

    // Register business rules
    this.coordinator.setRules(ALL_RULES);

    logDebug("[ControlPanelView] Initialized with new state architecture");
  }

  /**
   * Handler for commands from toolbar menu
   */
  public async handleCommand(command: string): Promise<void> {
    try {
      switch (command) {
        case "refreshCatalogs":
          await this.onRefresh();
          break;
        case "createStarter":
          await runInitWizard();
          break;
        case "openConfig":
          await openConfigOrInit();
          break;
        case "doctor":
          await runDoctor();
          break;
        case "resetCache":
          await this.onResetCache();
          break;
        case "openSettings":
          vscode.commands.executeCommand("workbench.action.openSettings", `@ext:${EXT_ID}`);
          break;
        case "updateAiModes":
          await this.onUpdateAiModes();
          break;
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      vscode.window.showErrorMessage(`LG: ${errorMessage}`);
    }
  }

  private async onRefresh(): Promise<void> {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "LG: Refreshing catalogs…", cancellable: false },
      async () => {
        await this.coordinator.dispatch({ type: "REFRESH" });
        await this.coordinator.waitForStability();
      }
    );
    vscode.window.showInformationMessage("LG catalogs refreshed successfully");
  }

  private async onResetCache(): Promise<void> {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "LG: Resetting cache…", cancellable: false },
      () => resetCache()
    );
    vscode.window.showInformationMessage("LG cache has been reset.");
  }

  private async onUpdateAiModes(): Promise<void> {
    const { AiModesTemplateGenerator } = await import("../services/ai/AiModesTemplateGenerator");
    const generator = new AiModesTemplateGenerator(getAiService());

    try {
      const filePath = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "LG: Updating AI modes template...",
          cancellable: false
        },
        () => generator.generate()
      );

      // Open the generated file
      const doc = await vscode.workspace.openTextDocument(filePath);
      await vscode.window.showTextDocument(doc);

      vscode.window.showInformationMessage("AI modes template updated successfully");
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      vscode.window.showErrorMessage(`Failed to update AI modes template: ${errorMessage}`);
    }
  }



  resolveWebviewView(view: vscode.WebviewView): void | Thenable<void> {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.buildHtml(view);

    // Subscribe to store changes → build ViewModel → send to renderer
    this.unsubscribeStore = this.store.subscribe((state) => {
      const viewModel = buildViewModel(state);
      this.postRender(viewModel);
    });

    // Subscribe to meta changes (loading state)
    this.unsubscribeMeta = this.coordinator.subscribeToMeta((meta) => {
      this.postMeta(meta);
    });

    // Handle messages from WebView
    view.webview.onDidReceiveMessage(async (msg) => {
      try {
        await this.handleWebViewMessage(msg);
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        logError(`[ControlPanelView] WebView message error: ${errorMessage}`);
        vscode.window.showErrorMessage(`LG: ${errorMessage}`);
      }
    });

    // Initialize on first show
    void this.coordinator.dispatch({ type: "INITIALIZE" });

    // Send current theme
    this.postTheme(vscode.window.activeColorTheme.kind);

    // Setup file watcher for lg-cfg changes
    this.setupFileWatcher();

    // Cleanup on dispose
    view.onDidDispose(() => {
      this.unsubscribeStore?.();
      this.unsubscribeMeta?.();
    });
  }

  private async handleWebViewMessage(msg: Record<string, unknown>): Promise<void> {
    const type = msg.type as string;

    // Handle commands from renderer
    if (type === "command") {
      const command = msg.command as Command;
      await this.coordinator.dispatch(command);
      return;
    }

    // Handle renderer ready signal
    if (type === "rendererReady") {
      // Send initial render
      const state = this.store.getState();
      const viewModel = buildViewModel(state);
      this.postRender(viewModel);
      return;
    }

    // Handle action buttons
    switch (type) {
      case "generateListing":
        await this.onGenerateListing();
        break;
      case "generateContext":
        await this.onGenerateContext();
        break;
      case "showContextStats":
        await this.onShowContextStats();
        break;
      case "showIncluded":
        await this.onShowIncluded();
        break;
      case "showStats":
        await this.onShowStats();
        break;
      case "sendToAI":
        await this.onSendToAI();
        break;
    }
  }

  /** Public method: safely send theme information to webview */
  public postTheme(kind: vscode.ColorThemeKind): void {
    this.view?.webview.postMessage({ type: "theme", kind });
  }

  // ==================== Action Handlers ====================

  private async onGenerateListing(): Promise<void> {
    const state = this.store.getPersistentState();
    const section = state.section;

    if (!section) {
      vscode.window.showWarningMessage("Select a section first.");
      return;
    }

    const content = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `LG: Generating listing '${section}'…`, cancellable: false },
      () => this.listingService.generateListing()
    );
    await this.vdocs.open("listing", `Listing — ${section}.md`, content);
  }

  private async onGenerateContext(): Promise<void> {
    const state = this.store.getPersistentState();
    const template = state.template;

    if (!template) {
      vscode.window.showWarningMessage("Select a template first.");
      return;
    }

    const content = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `LG: Generating context '${template}'…`, cancellable: false },
      () => this.contextService.generateContext()
    );
    await this.vdocs.open("context", `Context — ${template}.md`, content);
  }

  private async onShowContextStats(): Promise<void> {
    const state = this.store.getPersistentState();
    const template = state.template;

    if (!template) {
      vscode.window.showWarningMessage("Select a template first.");
      return;
    }

    const data = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "LG: Computing stats for context…", cancellable: false },
      () => this.contextService.getStats()
    );

    const { showStatsWebview } = await import("./StatsWebview");
    await showStatsWebview(
      this.context,
      data,
      () => this.contextService.getStats(),
      () => this.contextService.generateContext()
    );
  }

  private async onShowIncluded(): Promise<void> {
    const state = this.store.getPersistentState();
    const section = state.section;

    if (!section) {
      vscode.window.showWarningMessage("Select a section first.");
      return;
    }

    const files = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "LG: Collecting included paths…", cancellable: false },
      () => this.listingService.getIncludedFiles()
    );
    this.included.setPaths(files.map(f => f.path));
    await vscode.commands.executeCommand("lg.included.focus");
  }

  private async onShowStats(): Promise<void> {
    const state = this.store.getPersistentState();
    const section = state.section;

    if (!section) {
      vscode.window.showWarningMessage("Select a section first.");
      return;
    }

    const data = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "LG: Computing stats…", cancellable: false },
      () => this.listingService.getStats()
    );

    const { showStatsWebview } = await import("./StatsWebview");
    await showStatsWebview(
      this.context,
      data,
      () => this.listingService.getStats(),
      () => this.listingService.generateListing()
    );
  }

  private async onSendToAI(): Promise<void> {
    const state = this.store.getPersistentState();
    const providerId = state.providerId;
    const template = state.template;

    if (!providerId) {
      vscode.window.showWarningMessage("No AI provider selected.");
      return;
    }

    if (!template) {
      vscode.window.showWarningMessage("Select a context first. Section listings cannot be sent to AI.");
      return;
    }

    try {
      const aiService = getAiService();
      const runs = this.store.getIntegrationModeRuns(template, providerId);

      if (runs === null && providerId !== "clipboard") {
        vscode.window.showErrorMessage(
          "No integration mode configured for this context and provider.\n" +
          "Run 'Update AI Modes Template' from the toolbar to generate ai-interaction.sec.yaml."
        );
        return;
      }

      await aiService.generateAndSend(
        () => this.contextService.generateContext(),
        providerId,
        runs ?? "",
        `Generating context '${template}'...`
      );
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      vscode.window.showErrorMessage(`Failed to send to AI: ${errorMessage}`);
    }
  }

  // ==================== WebView Communication ====================

  private postRender(viewModel: ReturnType<typeof buildViewModel>): void {
    this.view?.webview.postMessage({ type: "render", viewModel });
  }

  private postMeta(meta: UIMeta): void {
    this.view?.webview.postMessage({ type: "setMeta", meta });
  }

  // ==================== File Watcher ====================

  private setupFileWatcher(): void {
    const root = effectiveWorkspaceRoot();
    if (!root) return;

    const lgCfgUri = vscode.Uri.file(path.join(root, "lg-cfg"));
    const pattern = new vscode.RelativePattern(lgCfgUri, "**/*");
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    let refreshTimer: NodeJS.Timeout | undefined;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        void this.coordinator.dispatch({ type: "REFRESH" });
        refreshTimer = undefined;
      }, 300);
    };

    watcher.onDidCreate(scheduleRefresh);
    watcher.onDidChange(scheduleRefresh);
    watcher.onDidDelete(scheduleRefresh);

    this.context.subscriptions.push(watcher);
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
}

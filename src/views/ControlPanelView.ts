import * as vscode from "vscode";
import * as path from "path";
import { VirtualDocProvider } from "./VirtualDocProvider";
import { IncludedTree } from "./IncludedTree";
import { ListingService } from "../services/ListingService";
import { ContextService } from "../services/ContextService";
import { listContextsJson, listTokenizerLibsJson, listEncodersJson, listSectionsJson, listModeSetsJson, listTagSetsJson } from "../services/CatalogService";
import type { ModeSetsList } from "../models/mode_sets_list";
import type { TagSetsList } from "../models/tag_sets_list";
import { resetCache, runDoctor } from "../services/DoctorService";
import { openConfigOrInit, runInitWizard } from "../starter/StarterConfig";
import { EXT_ID } from "../constants";
import { getAiService } from "../extension";
import { ControlStateService, type ControlPanelState } from "../services/ControlStateService";
import { getAvailableShells } from "../models/ShellType";
import { getAvailableClaudeModels } from "../models/ClaudeModel";
import { getAvailableClaudeMethods } from "../models/ClaudeIntegrationMethod";
import { effectiveWorkspaceRoot } from "../cli/CliResolver";

export class ControlPanelView implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  /** Guarantee that startup list/state loading is performed exactly once. */
  private bootstrapped = false;
  /** Service for managing panel state */
  private stateService: ControlStateService;
  /** Business services with access to state */
  private listingService: ListingService;
  private contextService: ContextService;
  /** Queue of state requests for synchronization */
  private stateRequestId = 0;
  private pendingStateRequests = new Map<number, { resolve: (state: Partial<ControlPanelState>) => void; reject: (error: Error) => void }>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly vdocs: VirtualDocProvider,
    private readonly included: IncludedTree
  ) {
    this.stateService = ControlStateService.getInstance(context);
    this.listingService = new ListingService(context);
    this.contextService = new ContextService(context);
    
    // Subscribe to state changes from other sources
    context.subscriptions.push(
      this.stateService.onDidChangeState((partial: Partial<ControlPanelState> & { _source?: string }) => {
        // Ignore updates initiated by Control Panel itself
        if (partial._source === "control-panel") {
          return;
        }

        // Remove service field before sending to WebView
        const { _source, ...cleanPartial } = partial;

        // Send changes to WebView for UI synchronization
        this.post({ type: "stateUpdate", state: cleanPartial });
      })
    );
  }

  /**
   * Handler for commands from toolbar
   */
  public async handleCommand(command: string): Promise<void> {
    try {
      switch (command) {
        case "refreshCatalogs":
          await this.onRefreshCatalogs();
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
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      vscode.window.showErrorMessage(`LG: ${errorMessage}`);
    }
  }

  private async onRefreshCatalogs(): Promise<void> {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "LG: Refreshing catalogs…", cancellable: false },
      () => this.pushListsAndState()
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


  /**
   * Requests current state from WebView (pull model).
   * Sends a request to WebView and waits for a response with the complete state of all controls.
   *
   * @param timeoutMs - timeout for waiting for response (default 5000ms)
   * @returns Promise with current state from WebView
   * @throws Error if WebView is not initialized or timeout expires
   */
  private async pullState(timeoutMs = 5000): Promise<Partial<ControlPanelState>> {
    if (!this.view) {
      throw new Error("WebView is not initialized");
    }

    const requestId = ++this.stateRequestId;

    return new Promise<Partial<ControlPanelState>>((resolve, reject) => {
      // Save promise in queue
      this.pendingStateRequests.set(requestId, { resolve, reject });

      // Set timeout
      const timeout = setTimeout(() => {
        this.pendingStateRequests.delete(requestId);
        reject(new Error("State request timeout"));
      }, timeoutMs);

      // Send request to WebView
      this.post({ type: "getState", requestId });

      // Clear timeout on successful resolution
      const originalResolve = resolve;
      const wrappedResolve = (state: Partial<ControlPanelState>) => {
        clearTimeout(timeout);
        originalResolve(state);
      };
      this.pendingStateRequests.set(requestId, { resolve: wrappedResolve, reject });
    });
  }

  private async onTokenizerLibChange(lib: string) {
    // When library changes, reload the encoders list
    const encoders = await listEncodersJson(lib).catch(() => []);

    // Update tokenization library (encoder remains as is, even if custom value)
    await this.stateService.setState({ tokenizerLib: lib }, "control-panel");

    // Send updated encoders list to webview
    this.post({ type: "encodersUpdated", encoders });
  }

  resolveWebviewView(view: vscode.WebviewView): void | Thenable<void> {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.buildHtml(view);

    view.webview.onDidReceiveMessage(async (msg) => {
      try {
        switch (msg.type) {
          case "init":
            await this.bootstrapOnce();
            break;
          case "stateResponse": {
            // Handle response to state request (pull model)
            const pending = this.pendingStateRequests.get(msg.requestId);
            if (pending) {
              this.pendingStateRequests.delete(msg.requestId);
              pending.resolve(msg.state as Partial<ControlPanelState>);
            }
            break;
          }
          case "tokenizerLibChanged":
            await this.onTokenizerLibChange(msg.lib);
            break;
          case "getProviderSetting": {
            // Request current AI provider setting to control CLI block visibility
            const config = vscode.workspace.getConfiguration();
            const providerId = config.get<string>("lg.ai.provider") || "clipboard";
            this.post({ type: "providerSettingResponse", providerId });
            break;
          }
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
          case "toggleTags":
            // Tags panel is handled purely on the client side
            break;
        }
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        vscode.window.showErrorMessage(`LG: ${errorMessage}`);
      }
    });

    // Primary initialization (double trigger possible: here and from "init" in webview)
    // Thanks to guard in bootstrapOnce() it will actually execute exactly once.
    this.bootstrapOnce().catch(() => void 0);
    // Send current theme immediately upon initialization
    this.postTheme(vscode.window.activeColorTheme.kind);


    // -------------------- watcher for lg-cfg -------------------- //
    const root = effectiveWorkspaceRoot();
    if (root) {
      const lgCfgUri = vscode.Uri.file(path.join(root, "lg-cfg"));
      const pattern = new vscode.RelativePattern(lgCfgUri, "**/*");
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);

      let refreshTimer: NodeJS.Timeout | undefined;
      const scheduleRefresh = () => {
        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => {
          this.pushListsAndState().catch(() => void 0);
          refreshTimer = undefined;
        }, 300);
      };

      watcher.onDidCreate(scheduleRefresh, this);
      watcher.onDidChange(scheduleRefresh, this);
      watcher.onDidDelete(scheduleRefresh, this);
      this.context.subscriptions.push(watcher);
    }
    
    // -------------------- watcher for AI provider changes -------------------- //
    this.context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("lg.ai.provider")) {
          // Notify webview about provider change to update CLI block visibility
          const config = vscode.workspace.getConfiguration();
          const providerId = config.get<string>("lg.ai.provider") || "clipboard";
          this.post({ type: "providerSettingResponse", providerId });
        }
      })
    );
  }

  /** Execute startup list/state loading exactly once. */
  private async bootstrapOnce(): Promise<void> {
    if (this.bootstrapped) return;
    this.bootstrapped = true;
    await this.pushListsAndState();
  }

  /** Public method: safely send theme information to webview */
  public postTheme(kind: vscode.ColorThemeKind) {
    this.view?.webview.postMessage({ type: "theme", kind });
  }

  // ——————————————— handlers ——————————————— //
  private async onGenerateListing() {
    // Pull current state from WebView
    const state = await this.pullState();
    await this.stateService.setState(state, "control-panel");

    const section = this.listingService.getCurrentSection();
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

  private async onGenerateContext() {
    // Pull current state from WebView
    const state = await this.pullState();
    await this.stateService.setState(state, "control-panel");

    const template = this.contextService.getCurrentTemplate();
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

  private async onShowContextStats() {
    // Pull current state from WebView
    const state = await this.pullState();
    await this.stateService.setState(state, "control-panel");

    const template = this.contextService.getCurrentTemplate();
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

  private async onShowIncluded() {
    // Pull current state from WebView
    const state = await this.pullState();
    await this.stateService.setState(state, "control-panel");

    const section = this.listingService.getCurrentSection();
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

  private async onShowStats() {
    // Pull current state from WebView
    const state = await this.pullState();
    await this.stateService.setState(state, "control-panel");

    const section = this.listingService.getCurrentSection();
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

  /**
   * Handler for "Send to AI" button
   */
  private async onSendToAI() {
    // Pull current state from WebView
    const state = await this.pullState();
    await this.stateService.setState(state, "control-panel");

    const aiService = getAiService();

    // Determine what to send: context or section
    const template = this.contextService.getCurrentTemplate();
    if (template) {
      // Send context
      await aiService.generateAndSend(
        () => this.contextService.generateContext(),
        `Generating context '${template}'...`
      );
    } else {
      // Send section
      const section = this.listingService.getCurrentSection();
      if (!section) {
        vscode.window.showWarningMessage("Select a section or template first.");
        return;
      }

      await aiService.generateAndSend(
        () => this.listingService.generateListing(),
        `Generating listing for '${section}'...`
      );
    }
  }

  // ——————————————— state ——————————————— //

  // Queue to protect against concurrent UI updates (CLI requests themselves are parallel)
  private listsChain: Promise<void> = Promise.resolve();

  private pushListsAndState(): Promise<void> {
    // Embed call in chain to protect against concurrent UI updates
    this.listsChain = this.listsChain
      .then(async () => {
        // Get current state for encoders
        const currentState = this.stateService.getState();

        // Parallel loading of all independent data from CLI
        const [
          sections,
          contexts,
          tokenizerLibs,
          encoders,
          modeSets,
          tagSets,
          { branches }
        ] = await Promise.all([
          listSectionsJson().catch(() => [] as string[]),
          listContextsJson().catch(() => [] as string[]),
          listTokenizerLibsJson().catch(() => [] as string[]),
          listEncodersJson(currentState.tokenizerLib ?? "tiktoken").catch(() => []),
          listModeSetsJson().catch(() => ({ "mode-sets": [] } as ModeSetsList)),
          listTagSetsJson().catch(() => ({ "tag-sets": [] } as TagSetsList)),
          this.stateService.updateBranches()
        ]);

        // Update state (depends on loaded data)
        await this.stateService.validateBasicParams(sections, contexts, tokenizerLibs);
        await this.stateService.actualizeState(modeSets, tagSets);

        // Get available lists for CLI settings
        const cliShells = getAvailableShells();
        const claudeModels = getAvailableClaudeModels();
        const claudeIntegrationMethods = getAvailableClaudeMethods();

        // Get final state to send to webview
        const state = this.stateService.getState();

        this.post({
          type: "data",
          sections,
          contexts,
          tokenizerLibs,
          encoders,
          modeSets,
          tagSets,
          branches,
          cliShells,
          claudeModels,
          claudeIntegrationMethods,
          state
        });
      })
      .catch(() => {
        // Suppress error to not break subsequent call chain
      });
    return this.listsChain;
  }

  private post(msg: Record<string, unknown>) {
    this.view?.webview.postMessage(msg);
  }

  // ——————————————— HTML ——————————————— //
  private buildHtml(view: vscode.WebviewView): string {
    // Dynamic loading of webview utilities to avoid circular dependencies
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { buildHtml, lgUiUri, mediaUri, toWebviewUri } = require("../webview/webviewKit") as typeof import("../webview/webviewKit");
    // Path to codicons is taken from node_modules (require.resolve is needed to get runtime path)
    const codicons = toWebviewUri(view.webview, require.resolve("@vscode/codicons/dist/codicon.css"));
    return buildHtml(view.webview, "control.html", {
      codiconsUri: codicons,
      baseCssUri: mediaUri(view.webview, "base.css"),
      lgUiCssUri: lgUiUri(view.webview, "lg-ui.css"),
      lgUiJsUri: lgUiUri(view.webview, "lg-ui.js"),
      controlCssUri: mediaUri(view.webview, "control.css"), // Layout only
      controlJsUri: mediaUri(view.webview, "control.js"),
    });
  }
}

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
import { getAvailableCodexReasoningEfforts } from "../models/CodexReasoningEffort";
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
        case "updateAiModes":
          await this.onUpdateAiModes();
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

  private async onProviderChanged(providerId: string) {
    // 1. Save to state
    await this.stateService.setState({ providerId }, "control-panel");

    // 2. Reload contexts (filtered by provider)
    const contexts = await listContextsJson(providerId).catch(() => [] as string[]);

    // 3. Get current context and validate it against new list
    let currentState = this.stateService.getState();
    let ctx = currentState.template || "";

    // 4. Validate current context: if not in new list, reset to first available
    if (ctx && !contexts.includes(ctx)) {
      ctx = contexts.length > 0 ? contexts[0] : "";
      await this.stateService.setState({ template: ctx }, "control-panel");
    }

    // 5. Reload mode-sets and tag-sets if context is selected
    let modeSets: ModeSetsList = { "mode-sets": [] };
    let tagSets: TagSetsList = { "tag-sets": [] };

    if (ctx) {
      [modeSets, tagSets] = await Promise.all([
        listModeSetsJson(ctx, providerId).catch(() => ({ "mode-sets": [] } as ModeSetsList)),
        listTagSetsJson(ctx).catch(() => ({ "tag-sets": [] } as TagSetsList))
      ]);

      // Actualize state (clean up obsolete modes/tags)
      await this.stateService.actualizeState(ctx, providerId, modeSets, tagSets);
    }

    // 6. Update CLI settings visibility
    const showCliSettings = providerId.endsWith(".cli");

    // 7. Send updates to webview (include validated template in state)
    this.post({
      type: "providerDataUpdate",
      contexts,
      modeSets,
      tagSets,
      showCliSettings,
      template: ctx  // Send validated template to webview
    });
  }

  private async onContextChanged(template: string) {
    // 1. Save to state
    await this.stateService.setState({ template }, "control-panel");

    const currentState = this.stateService.getState();
    const providerId = currentState.providerId || "";

    // 2. Reload mode-sets and tag-sets
    const [modeSets, tagSets] = await Promise.all([
      listModeSetsJson(template, providerId).catch(() => ({ "mode-sets": [] } as ModeSetsList)),
      listTagSetsJson(template).catch(() => ({ "tag-sets": [] } as TagSetsList))
    ]);

    // 3. Actualize state
    if (template && providerId) {
      await this.stateService.actualizeState(template, providerId, modeSets, tagSets);
    }

    // 4. Send updates to webview
    this.post({
      type: "contextDataUpdate",
      modeSets,
      tagSets
    });
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
          case "providerChanged":
            await this.onProviderChanged(msg.providerId);
            break;
          case "contextChanged":
            await this.onContextChanged(msg.template);
            break;
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
   * Handler for "Send to AI" button.
   *
   * Only works with contexts (templates). Section listings cannot be sent to AI.
   */
  private async onSendToAI() {
    // Pull current state from WebView
    const state = await this.pullState();
    await this.stateService.setState(state, "control-panel");

    const aiService = getAiService();
    const currentState = this.stateService.getState();
    const providerId = currentState.providerId || "";

    // Validate: must have provider selected
    if (!providerId) {
      vscode.window.showWarningMessage("No AI provider selected.");
      return;
    }

    // Validate: must have context selected
    const template = currentState.template || "";
    if (!template) {
      vscode.window.showWarningMessage("Select a context first. Section listings cannot be sent to AI.");
      return;
    }

    try {
      // Get mode-sets for the current context
      const modeSets = await listModeSetsJson(template, providerId);
      const runs = this.stateService.getIntegrationModeRuns(template, providerId, modeSets);

      // Validate: must have integration mode configured (except clipboard)
      if (runs === null && providerId !== "clipboard") {
        vscode.window.showErrorMessage(
          "No integration mode configured for this context and provider.\n" +
          "Run 'Update AI Modes Template' from the toolbar to generate ai-interaction.sec.yaml."
        );
        return;
      }

      // Send context to AI
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

  // ——————————————— state ——————————————— //

  // Queue to protect against concurrent UI updates (CLI requests themselves are parallel)
  private listsChain: Promise<void> = Promise.resolve();

  private pushListsAndState(): Promise<void> {
    // Embed call in chain to protect against concurrent UI updates
    this.listsChain = this.listsChain
      .then(async () => {
        // Get current state
        let currentState = this.stateService.getState();

        // Detect available AI providers (filters by environment availability)
        const aiService = getAiService();
        const providers = await aiService.detectAvailableProviders();

        // Determine provider FIRST (before loading contexts)
        // Priority: 1) saved in state, 2) auto-detect best available, 3) first in list
        let providerId = currentState.providerId || "";
        if (!providerId) {
          providerId = await aiService.detectBestProvider();
          await this.stateService.setState({ providerId }, "control-panel");
          currentState = this.stateService.getState();
        }

        // Parallel loading of all independent data from CLI
        // Note: contexts are loaded WITH provider filter
        const [
          sections,
          contexts,
          tokenizerLibs,
          encoders,
          { branches }
        ] = await Promise.all([
          listSectionsJson().catch(() => [] as string[]),
          listContextsJson(providerId).catch(() => [] as string[]),
          listTokenizerLibsJson().catch(() => [] as string[]),
          listEncodersJson(currentState.tokenizerLib ?? "tiktoken").catch(() => []),
          this.stateService.updateBranches()
        ]);

        // Validate and update state (depends on loaded data)
        await this.stateService.validateBasicParams(sections, contexts, tokenizerLibs);
        const state = this.stateService.getState();
        const ctx = state.template || "";

        // Load mode-sets and tag-sets with context and provider
        const [modeSets, tagSets] = await Promise.all([
          listModeSetsJson(ctx, providerId).catch(() => ({ "mode-sets": [] } as ModeSetsList)),
          listTagSetsJson(ctx).catch(() => ({ "tag-sets": [] } as TagSetsList))
        ]);

        await this.stateService.actualizeState(ctx, providerId, modeSets, tagSets);

        // Get available lists for CLI settings
        const cliShells = getAvailableShells();
        const claudeModels = getAvailableClaudeModels();
        const claudeIntegrationMethods = getAvailableClaudeMethods();
        const codexReasoningEfforts = getAvailableCodexReasoningEfforts();

        // Get final state to send to webview
        const finalState = this.stateService.getState();

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
          codexReasoningEfforts,
          providers,
          state: finalState
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

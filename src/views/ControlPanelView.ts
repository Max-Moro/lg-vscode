import * as vscode from "vscode";
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

export class ControlPanelView implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  /** Гарантия, что стартовую загрузку списков/state делаем ровно один раз. */
  private bootstrapped = false;
  /** Сервис управления состоянием панели */
  private stateService: ControlStateService;
  /** Бизнес-сервисы с доступом к состоянию */
  private listingService: ListingService;
  private contextService: ContextService;
  /** Очередь запросов состояния для синхронизации */
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
    
    // Подписываемся на изменения состояния из других источников
    context.subscriptions.push(
      this.stateService.onDidChangeState((partial: any) => {
        // Игнорируем обновления, инициированные самой Control Panel
        if (partial._source === "control-panel") {
          return;
        }
        
        // Удаляем служебное поле перед отправкой в WebView
        const { _source, ...cleanPartial } = partial;
        
        // Отправляем изменения в WebView для синхронизации UI
        this.post({ type: "stateUpdate", state: cleanPartial });
      })
    );
  }

  /**
   * Обработчик команд из toolbar
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
    } catch (e: any) {
      vscode.window.showErrorMessage(`LG: ${e?.message || e}`);
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
   * Запрашивает актуальное состояние из WebView (pull-модель).
   * Отправляет запрос в WebView и ожидает ответ с полным состоянием всех контролов.
   * 
   * @param timeoutMs - таймаут ожидания ответа (по умолчанию 5000ms)
   * @returns Promise с актуальным состоянием из WebView
   * @throws Error если WebView не инициализирован или таймаут истек
   */
  private async pullState(timeoutMs = 5000): Promise<Partial<ControlPanelState>> {
    if (!this.view) {
      throw new Error("WebView is not initialized");
    }

    const requestId = ++this.stateRequestId;
    
    return new Promise<Partial<ControlPanelState>>((resolve, reject) => {
      // Сохраняем промис в очереди
      this.pendingStateRequests.set(requestId, { resolve, reject });

      // Устанавливаем таймаут
      const timeout = setTimeout(() => {
        this.pendingStateRequests.delete(requestId);
        reject(new Error("State request timeout"));
      }, timeoutMs);

      // Отправляем запрос в WebView
      this.post({ type: "getState", requestId });

      // Очищаем таймаут при успешном разрешении
      const originalResolve = resolve;
      const wrappedResolve = (state: Partial<ControlPanelState>) => {
        clearTimeout(timeout);
        originalResolve(state);
      };
      this.pendingStateRequests.set(requestId, { resolve: wrappedResolve, reject });
    });
  }

  private async onTokenizerLibChange(lib: string) {
    // При смене библиотеки перезагружаем список энкодеров
    const encoders = await listEncodersJson(lib).catch(() => [] as any[]);
    
    // Обновляем библиотеку токенизации (encoder остается как есть, даже если это кастомное значение)
    await this.stateService.setState({ tokenizerLib: lib }, "control-panel");
    
    // Отправляем обновленный список энкодеров в webview
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
          case "stateResponse":
            // Обработка ответа на запрос состояния (pull-модель)
            const pending = this.pendingStateRequests.get(msg.requestId);
            if (pending) {
              this.pendingStateRequests.delete(msg.requestId);
              pending.resolve(msg.state as Partial<ControlPanelState>);
            }
            break;
          case "tokenizerLibChanged":
            await this.onTokenizerLibChange(msg.lib);
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
      } catch (e: any) {
        vscode.window.showErrorMessage(`LG: ${e?.message || e}`);
      }
    });

    // Первичная инициализация (возможен двойной триггер: здесь и по "init" из webview)
    // Благодаря guard в bootstrapOnce() фактически выполнится ровно один раз.
    this.bootstrapOnce().catch(() => void 0);
    // Отправим текущую тему сразу при инициализации
    this.postTheme(vscode.window.activeColorTheme.kind);


    // -------------------- watcher на lg-cfg -------------------- //
    const { effectiveWorkspaceRoot } = require("../cli/CliResolver");
    const root = effectiveWorkspaceRoot();
    if (root) {
      const lgCfgUri = vscode.Uri.file(require("path").join(root, "lg-cfg"));
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

  /** Выполнить стартовую загрузку списков/состояния ровно один раз. */
  private async bootstrapOnce(): Promise<void> {
    if (this.bootstrapped) return;
    this.bootstrapped = true;
    await this.pushListsAndState();
  }

  /** Публичный метод: безопасно отправить в webview информацию о теме */
  public postTheme(kind: vscode.ColorThemeKind) {
    this.view?.webview.postMessage({ type: "theme", kind });
  }

  // ——————————————— handlers ——————————————— //
  private async onGenerateListing() {
    // Pull актуальное состояние из WebView
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
    // Pull актуальное состояние из WebView
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
    // Pull актуальное состояние из WebView
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
    // Pull актуальное состояние из WebView
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
    // Pull актуальное состояние из WebView
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
   * Обработчик кнопки "Send to AI"
   */
  private async onSendToAI() {
    // Pull актуальное состояние из WebView
    const state = await this.pullState();
    await this.stateService.setState(state, "control-panel");
    
    const aiService = getAiService();
    
    // Определяем, что отправлять: контекст или секцию
    const template = this.contextService.getCurrentTemplate();
    if (template) {
      // Отправляем контекст
      await aiService.generateAndSend(
        () => this.contextService.generateContext(),
        `Generating context '${template}'...`
      );
    } else {
      // Отправляем секцию
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

  // ——————————————— state & lists ——————————————— //

  // Очередь для последовательного выполнения listSectionsJson / listContextsJson / listModelsJson
  private listsChain: Promise<void> = Promise.resolve();

  private pushListsAndState(): Promise<void> {
    // Встраиваем вызов в цепочку, чтобы запросы шли строго последовательно.
    this.listsChain = this.listsChain
      .then(async () => {
        const sections = await listSectionsJson().catch(() => [] as string[]);
        const contexts = await listContextsJson().catch(() => [] as string[]);
        
        // Загружаем библиотеки токенизации
        const tokenizerLibs = await listTokenizerLibsJson().catch(() => [] as string[]);
        
        // Загружаем энкодеры для текущей библиотеки
        const currentState = this.stateService.getState();
        const encoders = await listEncodersJson(currentState.tokenizerLib!).catch(() => [] as any[]);
        
        const modeSets = await listModeSetsJson().catch(() => ({ "mode-sets": [] } as ModeSetsList));
        const tagSets = await listTagSetsJson().catch(() => ({ "tag-sets": [] } as TagSetsList));
        
        // Актуализация состояния через сервис
        await this.stateService.validateBasicParams(sections, contexts, tokenizerLibs);
        await this.stateService.actualizeState(modeSets, tagSets);
        
        // Обновляем список веток через ControlStateService
        const { branches } = await this.stateService.updateBranches();
        
        // Получаем актуальное состояние для отправки в webview
        const state = this.stateService.getState();
        
        this.post({ type: "data", sections, contexts, tokenizerLibs, encoders, modeSets, tagSets, branches, state });
      })
      .catch(() => {
        // Гасим ошибку, чтобы не «сломать» цепочку последующих вызовов
      });
    return this.listsChain;
  }

  private post(msg: any) {
    this.view?.webview.postMessage(msg);
  }

  // ——————————————— HTML ——————————————— //
  private buildHtml(view: vscode.WebviewView): string {
    const { buildHtml, lgUiUri, mediaUri, toWebviewUri } = require("../webview/webviewKit") as typeof import("../webview/webviewKit");
    // путь к codicons берём из node_modules
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

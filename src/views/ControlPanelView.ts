import * as vscode from "vscode";
import { VirtualDocProvider } from "./VirtualDocProvider";
import { IncludedTree } from "./IncludedTree";
import { runListIncludedJson, runListing, type ListingParams } from "../services/ListingService";
import { runContext, runContextStatsJson, type ContextParams } from "../services/ContextService";
import { runStatsJson, type StatsParams } from "../services/StatsService";
import { listContextsJson, listTokenizerLibsJson, listEncodersJson, listSectionsJson, listModeSetsJson, listTagSetsJson } from "../services/CatalogService";
import type { ModeSetsList } from "../models/mode_sets_list";
import type { TagSetsList } from "../models/tag_sets_list";
import { resetCache } from "../services/DoctorService";
import { runDoctor } from "../diagnostics/Doctor";
import { openConfigOrInit, runInitWizard } from "../starter/StarterConfig";
import { AiIntegrationService } from "../services/ai";
import { GitService } from "../services/GitService";
import { EXT_ID } from "../constants";
import type { CliOptions } from "../cli/CliClient";

type PanelState = {
  section: string;
  template: string;
  tokenizerLib: string;
  encoder: string;
  ctxLimit: number;
  modes: Record<string, string>;
  tags: string[];
  taskText: string;
  targetBranch: string;
};

const MKEY = "lg.control.state";
const DEFAULT_STATE: PanelState = {
  section: "all-src",
  template: "",
  tokenizerLib: "tiktoken",
  encoder: "cl100k_base",
  ctxLimit: 128000,
  modes: {},
  tags: [],
  taskText: "",
  targetBranch: ""
};

export class ControlPanelView implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  /** Гарантия, что стартовую загрузку списков/state делаем ровно один раз. */
  private bootstrapped = false;
  /** Универсальный AI-сервис */
  private aiService = new AiIntegrationService();
  /** Git сервис для получения информации о ветках */
  private gitService = new GitService();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly vdocs: VirtualDocProvider,
    private readonly included: IncludedTree
  ) {}

  private getTokenizationParams(state: PanelState): { 
    tokenizerLib: string;
    encoder: string;
    ctxLimit: number;
  } {
    return {
      tokenizerLib: state.tokenizerLib || "tiktoken",
      encoder: state.encoder || "cl100k_base",
      ctxLimit: state.ctxLimit || 128000
    };
  }

  private getFullCliOptions(state: PanelState): CliOptions {
    return {
      ...this.getTokenizationParams(state),
      modes: Object.keys(state.modes || {}).length > 0 ? state.modes : undefined,
      tags: Array.isArray(state.tags) && state.tags.length > 0 ? state.tags : undefined,
      taskText: state.taskText && state.taskText.trim() ? state.taskText.trim() : undefined,
      targetBranch: state.targetBranch && state.targetBranch.trim() ? state.targetBranch.trim() : undefined
    };
  }

  private async onTokenizerLibChange(lib: string) {
    // При смене библиотеки перезагружаем список энкодеров
    const encoders = await listEncodersJson(lib).catch(() => [] as any[]);
    
    // Обновляем библиотеку токенизации (encoder остается как есть, даже если это кастомное значение)
    this.setState({ tokenizerLib: lib });
    
    // Отправляем обновленный список энкодеров в webview
    this.post({ type: "encoders", encoders });
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
          case "setState":
            this.setState(msg.state as Partial<PanelState>);
            break;
          case "tokenizerLibChanged":
            await this.onTokenizerLibChange(msg.lib);
            break;
          case "generateListing":
            await this.onGenerateListing();
            break;
          case "sendListingToAI":
            await this.onSendListingToAI();
            break;
          case "generateContext":
            await this.onGenerateContext();
            break;
          case "sendContextToAI":
            await this.onSendContextToAI();
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
          case "resetCache":
            await vscode.window.withProgress(
              { location: vscode.ProgressLocation.Notification, title: "LG: Resetting cache…", cancellable: false },
              async () => resetCache()
            );
            vscode.window.showInformationMessage("LG cache has been reset.");
            break;
          case "createStarter":
            await runInitWizard();
            break;
          case "openConfig":
            await openConfigOrInit();
            break;
          case "doctor":
            await runDoctor(this.context);
            break;
          case "openSettings":
            vscode.commands.executeCommand("workbench.action.openSettings", `@ext:${EXT_ID}`);
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
    const s = this.getState();
    const params: ListingParams = {
      section: s.section,
      ...this.getTokenizationParams(s),
      ...this.getAdaptiveParams(s)
    };
    const content = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "LG: Generating listing…", cancellable: false },
      () => runListing(params)
    );
    await this.vdocs.open("listing", `Listing — ${s.section}.md`, content);
  }

  private async onGenerateContext() {
    const s = this.getState();
    if (!s.template) {
      vscode.window.showWarningMessage("Select a template first.");
      return;
    }
    const options = this.getFullCliOptions(s);
    const content = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `LG: Generating context '${s.template}'…`, cancellable: false },
      () => runContext(s.template, options)
    );
    await this.vdocs.open("context", `Context — ${s.template}.md`, content);
  }

  private async onShowContextStats() {
    const s = this.getState();
    if (!s.template) {
      vscode.window.showWarningMessage("Select a template first.");
      return;
    }
    const params: ContextParams = {
      template: s.template,
      ...this.getTokenizationParams(s),
      modes: Object.keys(s.modes || {}).length > 0 ? s.modes : undefined,
      tags: Array.isArray(s.tags) && s.tags.length > 0 ? s.tags : undefined,
      taskText: s.taskText && s.taskText.trim() ? s.taskText.trim() : undefined,
      targetBranch: s.targetBranch && s.targetBranch.trim() ? s.targetBranch.trim() : undefined
    };
    const data = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `LG: Computing stats for context '${s.template}'…`, cancellable: false },
      () => runContextStatsJson(params)
    );
    const { showStatsWebview } = await import("./StatsWebview");
    await showStatsWebview(
      data,
      (taskText) => runContextStatsJson({ ...params, taskText }),
      (taskText) => runContext(s.template, this.getFullCliOptions({ ...s, taskText: taskText || "" })),
      s.taskText
    );
  }

  private async onShowIncluded() {
    const s = this.getState();
    const params: ListingParams = {
      section: s.section,
      ...this.getTokenizationParams(s),
      modes: Object.keys(s.modes || {}).length > 0 ? s.modes : undefined,
      tags: Array.isArray(s.tags) && s.tags.length > 0 ? s.tags : undefined,
      taskText: s.taskText && s.taskText.trim() ? s.taskText.trim() : undefined,
      targetBranch: s.targetBranch && s.targetBranch.trim() ? s.targetBranch.trim() : undefined
    };
    const files = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "LG: Collecting included paths…", cancellable: false },
      () => runListIncludedJson(params)
    );
    this.included.setPaths(files.map(f => f.path));
    await vscode.commands.executeCommand("lg.included.focus");
  }

  private async onShowStats() {
    const s = this.getState();
    const params: StatsParams = {
      section: s.section,
      ...this.getTokenizationParams(s),
      modes: Object.keys(s.modes || {}).length > 0 ? s.modes : undefined,
      tags: Array.isArray(s.tags) && s.tags.length > 0 ? s.tags : undefined,
      taskText: s.taskText && s.taskText.trim() ? s.taskText.trim() : undefined,
      targetBranch: s.targetBranch && s.targetBranch.trim() ? s.targetBranch.trim() : undefined
    };
    const data = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "LG: Computing stats…", cancellable: false },
      () => runStatsJson(params)
    );
    const { showStatsWebview } = await import("./StatsWebview");
    await showStatsWebview(
      data,
      (taskText) => runStatsJson({ ...params, taskText }),
      (taskText) => runListing({ ...params, taskText }),
      s.taskText
    );
  }

  private async onSendContextToAI() {
    const s = this.getState();
    if (!s.template) {
      vscode.window.showWarningMessage("Select a template first.");
      return;
    }
    const options = this.getFullCliOptions(s);
    const content = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `LG: Generating context '${s.template}' for AI…`, cancellable: false },
      () => runContext(s.template, options)
    );
    await this.aiService.sendContext(s.template, content);
  }

  private async onSendListingToAI() {
    const s = this.getState();
    const params: ListingParams = {
      section: s.section,
      ...this.getTokenizationParams(s),
      modes: Object.keys(s.modes || {}).length > 0 ? s.modes : undefined,
      tags: Array.isArray(s.tags) && s.tags.length > 0 ? s.tags : undefined,
      taskText: s.taskText && s.taskText.trim() ? s.taskText.trim() : undefined,
      targetBranch: s.targetBranch && s.targetBranch.trim() ? s.targetBranch.trim() : undefined
    };
    const content = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `LG: Generating listing '${s.section}' for AI…`, cancellable: false },
      () => runListing(params)
    );
    await this.aiService.sendListing(s.section, content);
  }

  // ——————————————— state & lists ——————————————— //
  private getState(): PanelState {
    return { ...DEFAULT_STATE, ...(this.context.workspaceState.get<PanelState>(MKEY) || {}) };
  }
  private setState(partial: Partial<PanelState>) {
    const next = { ...this.getState(), ...partial };
    this.context.workspaceState.update(MKEY, next);
    this.post({ type: "state", state: next });
  }

  private getAdaptiveParams(state: PanelState): { 
    modes?: Record<string, string>; 
    tags?: string[];
    taskText?: string;
    targetBranch?: string;
  } {
    return {
      modes: Object.keys(state.modes || {}).length > 0 ? state.modes : undefined,
      tags: Array.isArray(state.tags) && state.tags.length > 0 ? state.tags : undefined,
      taskText: state.taskText && state.taskText.trim() ? state.taskText.trim() : undefined,
      targetBranch: state.targetBranch && state.targetBranch.trim() ? state.targetBranch.trim() : undefined
    };
  }

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
        const state = this.getState();
        const currentLib = state.tokenizerLib || "tiktoken";
        const encoders = await listEncodersJson(currentLib).catch(() => [] as any[]);
        
        const modeSets = await listModeSetsJson().catch(() => ({ "mode-sets": [] } as ModeSetsList));
        const tagSets = await listTagSetsJson().catch(() => ({ "tag-sets": [] } as TagSetsList));
        
        // Fetch Git branches if available
        const branches = await this.fetchBranches();

        let stateChanged = false;
        
        // Валидация section
        if (!sections.includes(state.section) && sections.length) {
          state.section = sections[0];
          stateChanged = true;
        }
        
        // Валидация tokenizerLib
        if (!tokenizerLibs.includes(state.tokenizerLib) && tokenizerLibs.length) {
          state.tokenizerLib = tokenizerLibs[0];
          stateChanged = true;
        }
        
        // Валидация encoder - разрешаем произвольные значения, валидируем только если пусто
        if (!state.encoder && encoders.length) {
          const encoderNames = encoders.map(e => e.name);
          state.encoder = encoderNames[0] || "cl100k_base";
          stateChanged = true;
        }
        
        // Валидация ctxLimit
        if (!state.ctxLimit || state.ctxLimit < 1000 || state.ctxLimit > 2_000_000) {
          state.ctxLimit = 128000;
          stateChanged = true;
        }
        
        if (stateChanged) {
          await this.context.workspaceState.update(MKEY, state);
        }
        this.post({ type: "data", sections, contexts, tokenizerLibs, encoders, modeSets, tagSets, branches, state });
      })
      .catch(() => {
        // Гасим ошибку, чтобы не «сломать» цепочку последующих вызовов
      });
    return this.listsChain;
  }

  private async fetchBranches(): Promise<string[]> {
    try {
      if (!(await this.gitService.isAvailable())) {
        return [];
      }
      
      const branchesInfo = await this.gitService.getAllBranches();
      if (!branchesInfo) {
        return [];
      }
      
      // Combine local and remote branches, removing duplicates
      const allBranches = [
        ...branchesInfo.local.map(b => b.name).filter((n): n is string => !!n),
        ...branchesInfo.remote.map(b => b.name).filter((n): n is string => !!n)
      ];
      
      // Remove duplicates and sort
      const uniqueBranches = Array.from(new Set(allBranches)).sort();
      
      return uniqueBranches;
    } catch (error) {
      // Fail silently if git is not available
      return [];
    }
  }

  private post(msg: any) {
    this.view?.webview.postMessage(msg);
  }

  // ——————————————— HTML ——————————————— //
  private buildHtml(view: vscode.WebviewView): string {
    const { buildHtml, mediaUri, toWebviewUri } = require("../webview/webviewKit") as typeof import("../webview/webviewKit");
    // путь к codicons берём из node_modules
    const codicons = toWebviewUri(view.webview, require.resolve("@vscode/codicons/dist/codicon.css"));
    return buildHtml(view.webview, "control.html", {
      codiconsUri: codicons,
      baseCssUri:  mediaUri(view.webview, "base.css"),
      controlCssUri: mediaUri(view.webview, "control.css"),
      controlJsUri:  mediaUri(view.webview, "control.js"),
      commonUiJsUri: mediaUri(view.webview, "common-ui.js"),
    });
  }
}

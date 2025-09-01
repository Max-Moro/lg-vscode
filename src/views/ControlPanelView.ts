import * as vscode from "vscode";
import { VirtualDocProvider } from "./VirtualDocProvider";
import { IncludedTree } from "./IncludedTree";
import { runListIncludedJson, runListing } from "../services/ListingService";
import { runContext, runContextStatsJson } from "../services/ContextService";
import { runStatsJson } from "../services/StatsService";
import { listContextsJson, listModelsJson, listSectionsJson } from "../services/CatalogService";
import { EXT_ID } from "../constants";

type PanelState = {
  section: string;
  mode: "all" | "changes";
  template: string;
  model: string;
};

const MKEY = "lg.control.state";
const DEFAULT_STATE: PanelState = {
  section: "all-src",
  mode: "all",
  template: "",
  model: "o3"
};

export class ControlPanelView implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  /** Гарантия, что стартовую загрузку списков/state делаем ровно один раз. */
  private bootstrapped = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly vdocs: VirtualDocProvider,
    private readonly included: IncludedTree
  ) {}

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
          case "resetCache":
            vscode.commands.executeCommand("lg.resetCache");
            break;
          case "createStarter":
            vscode.commands.executeCommand("lg.createStarterConfig");
            break;
          case "openConfig":
            vscode.commands.executeCommand("lg.openConfig");
            break;
          case "doctor":
            vscode.commands.executeCommand("lg.runDoctor");
            break;
          case "openSettings":
            vscode.commands.executeCommand("workbench.action.openSettings", `@ext:${EXT_ID}`);
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
    const content = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "LG: Generating listing…", cancellable: false },
      () => runListing({ section: s.section, mode: s.mode })
    );
    await this.vdocs.open("listing", `Listing — ${s.section}.md`, content);
  }

  private async onGenerateContext() {
    const s = this.getState();
    if (!s.template) {
      vscode.window.showWarningMessage("Select a template first.");
      return;
    }
    const content = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `LG: Generating context '${s.template}'…`, cancellable: false },
      () => runContext(s.template)
    );
    await this.vdocs.open("context", `Context — ${s.template}.md`, content);
  }

  private async onShowContextStats() {
    const s = this.getState();
    if (!s.template) {
      vscode.window.showWarningMessage("Select a template first.");
      return;
    }
    const modelId = s.model || "o3";
    const data = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `LG: Computing stats for context '${s.template}'…`, cancellable: false },
      () => runContextStatsJson({ template: s.template, model: modelId })
    );
    const { showStatsWebview } = await import("./StatsWebview");
    await showStatsWebview(
      data,
      () => runContextStatsJson({ template: s.template, model: modelId }),
      () => runContext(s.template)
    );
  }

  private async onShowIncluded() {
    const s = this.getState();
    const files = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "LG: Collecting included paths…", cancellable: false },
      () => runListIncludedJson({ section: s.section, mode: s.mode })
    );
    this.included.setPaths(files.map(f => f.path));
    await vscode.commands.executeCommand("lg.included.focus");
  }

  private async onShowStats() {
    const s = this.getState();
    const modelId = s.model || "o3";
    const data = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "LG: Computing stats…", cancellable: false },
      () => runStatsJson({ section: s.section, mode: s.mode, model: modelId })
    );
    const { showStatsWebview } = await import("./StatsWebview");
    await showStatsWebview(
      data,
      () => runStatsJson({ section: s.section, mode: s.mode, model: modelId }),
      () => runListing({ section: s.section, mode: s.mode })
    );
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

  // Очередь для последовательного выполнения listSectionsJson / listContextsJson / listModelsJson
  private listsChain: Promise<void> = Promise.resolve();

  private pushListsAndState(): Promise<void> {
    // Встраиваем вызов в цепочку, чтобы запросы шли строго последовательно.
    this.listsChain = this.listsChain
      .then(async () => {
        const sections = await listSectionsJson().catch(() => [] as string[]);
        const contexts = await listContextsJson().catch(() => [] as string[]);
        const models = await listModelsJson().catch(() => [] as any[]);

        const state = this.getState();
        if (!sections.includes(state.section) && sections.length) {
          state.section = sections[0];
          await this.context.workspaceState.update(MKEY, state);
        }
        if (models.length) {
          const ids = models.map((m: any) => m.id);
          if (!ids.includes(state.model)) {
            state.model = models[0].id;
            await this.context.workspaceState.update(MKEY, state);
          }
        }
        this.post({ type: "data", sections, contexts, models, state });
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

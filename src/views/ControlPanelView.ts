import * as vscode from "vscode";
import * as path from "path";
import {
  listSectionsJson,
  listContextsJson,
  listModelsJson,
  runListing,
  runContext,
  runListIncludedJson,
  runStatsJson,
  runContextStatsJson
} from "../runner/LgLocator";
import { VirtualDocProvider } from "./VirtualDocProvider";
import { IncludedTree } from "./IncludedTree";

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
            await this.pushListsAndState();
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
            vscode.commands.executeCommand("workbench.action.openSettings", "@ext:your-org.vscode-lg");
            break;
        }
      } catch (e: any) {
        vscode.window.showErrorMessage(`LG: ${e?.message || e}`);
      }
    });

    // Первичная инициализация
    this.pushListsAndState().catch(() => void 0);
    // Отправим текущую тему сразу при инициализации
    this.postTheme(vscode.window.activeColorTheme.kind);


    // -------------------- watcher на lg-cfg -------------------- //
    const { effectiveWorkspaceRoot } = require("../runner/LgLocator");
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
      () => runContextStatsJson({ template: s.template, model: modelId })
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
      () => runStatsJson({ section: s.section, mode: s.mode, model: modelId })
    );
  }

  // ——————————————— state & lists ——————————————— //
  private getState(): PanelState {
    return { ...DEFAULT_STATE, ...(this.context.globalState.get<PanelState>(MKEY) || {}) };
  }
  private setState(partial: Partial<PanelState>) {
    const next = { ...this.getState(), ...partial };
    this.context.globalState.update(MKEY, next);
    this.post({ type: "state", state: next });
  }

  private async pushListsAndState() {
    const [sections, contexts, models] = await Promise.all([
      listSectionsJson().catch(() => [] as string[]),
      listContextsJson().catch(() => [] as string[]),
      listModelsJson().catch(() => [] as any[])
    ]);
    const state = this.getState();
    if (!sections.includes(state.section) && sections.length) {
      state.section = sections[0];
      this.context.globalState.update(MKEY, state);
    }
    if (models.length) {
      const ids = models.map((m: any) => m.id);
      if (!ids.includes(state.model)) {
        state.model = models[0].id;
        this.context.globalState.update(MKEY, state);
      }
    }
    this.post({ type: "data", sections, contexts, models, state });
  }

  private post(msg: any) {
    this.view?.webview.postMessage(msg);
  }

  // ——————————————— HTML ——————————————— //
  private buildHtml(view: vscode.WebviewView): string {
    // читаем шаблон control.html и подставляем необходимые URI/значения
    const tplUri = vscode.Uri.joinPath(this.context.extensionUri, "media", "control.html");
    const raw = require("fs").readFileSync(tplUri.fsPath, "utf8");
    // ВАЖНО: путь к codicon.css берём через require.resolve — это устойчиво к хоистингу node_modules
    const codiconCssPath = require.resolve("@vscode/codicons/dist/codicon.css");
    const codicons = view.webview.asWebviewUri(vscode.Uri.file(codiconCssPath)).toString();
    const csp = view.webview.cspSource;
    return raw
      .replaceAll("{{codiconsUri}}", codicons)
      .replaceAll("{{cspSource}}", csp);
  }
}
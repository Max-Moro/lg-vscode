import * as vscode from "vscode";
import {
  listSectionsJson,
  listContextsJson,
  runListing,
  runContext,
  runListIncludedJson,
  runStatsJson
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
  section: "all",
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
    view.webview.html = this.getHtml();

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
          case "showIncluded":
            await this.onShowIncluded();
            break;
          case "showStats":
            await this.onShowStats();
            break;
          case "createStarter":
            vscode.commands.executeCommand("lg.createStarterConfig");
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
    const data = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "LG: Computing stats…", cancellable: false },
      () => runStatsJson({ section: s.section, mode: s.mode, model: s.model })
    );
    const { showStatsWebview } = await import("./StatsWebview");
    await showStatsWebview(data);
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
    const [sections, contexts] = await Promise.all([
      listSectionsJson().catch(() => [] as string[]),
      listContextsJson().catch(() => [] as string[])
    ]);
    const state = this.getState();
    if (!sections.includes(state.section) && sections.length) {
      state.section = sections[0];
      this.context.globalState.update(MKEY, state);
    }
    this.post({ type: "data", sections, contexts, state });
  }

  private post(msg: any) {
    this.view?.webview.postMessage(msg);
  }

  // ——————————————— HTML ——————————————— //
  private getHtml() {
    const csp = ""; // VS Code webview uses safe default; we only do inline-no eval.
    const css = `
      body { font: 12px/1.5 var(--vscode-font-family); color: var(--vscode-foreground); padding: 8px; }
      h3 { margin: 8px 0; font-weight: 600; }
      .row { display: flex; gap: 6px; align-items: center; margin: 6px 0; flex-wrap: wrap; }
      select, button, input[type="radio"] { font: inherit; }
      button { display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; }
      .help { color: var(--vscode-descriptionForeground); margin: 4px 0 8px; }
      .block { border: 1px solid var(--vscode-editorIndentGuide-background); border-radius: 6px; padding: 8px; margin-bottom: 10px; }
      .spacer { flex: 1; }
      .codicon { font-size: 14px; }
      .muted { color: var(--vscode-descriptionForeground); }
    `;
    const html = `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'unsafe-inline';">
        <style>${css}</style>
      </head>
      <body>
        <div class="block">
          <h3><span class="codicon codicon-organization"></span> Project Scope</h3>
          <div class="row">
            <label>Section:</label>
            <select id="section"></select>
            <span class="spacer"></span>
            <label>Mode:</label>
            <label><input type="radio" name="mode" value="all"> all</label>
            <label><input type="radio" name="mode" value="changes"> changes</label>
          </div>
          <div class="help">Выберите секцию и режим (all — весь проект, changes — только изменённые файлы по Git).</div>
        </div>

        <div class="block">
          <h3><span class="codicon codicon-run"></span> Generate</h3>
          <div class="row">
            <button id="btn-listing" title="Сшить исходники из выбранной секции в единый листинг">
              <span class="codicon codicon-play"></span> Generate Listing
            </button>
            <select id="template" title="Шаблон контекстного промта (.tpl.md)">
              <option value="">— select template —</option>
            </select>
            <button id="btn-context" title="Сгенерировать контекст-промт по шаблону">
              <span class="codicon codicon-file-code"></span> Generate Context
            </button>
          </div>
          <div class="help">Listing — склейка файлов. Context — шаблон с автоподстановкой листингов секций.</div>
        </div>

        <div class="block">
          <h3><span class="codicon codicon-graph"></span> Inspect</h3>
          <div class="row">
            <button id="btn-included" title="Показать какие файлы проходят фильтры">
              <span class="codicon codicon-list-tree"></span> Show Included
            </button>
            <button id="btn-stats" title="Таблица размеров и токенов с долями контекста">
              <span class="codicon codicon-table"></span> Show Stats
            </button>
            <span class="spacer"></span>
            <label class="muted">Model:</label>
            <select id="model">
              <option>o3</option>
              <option>gpt-4o</option>
              <option>gpt-4o-mini</option>
              <option>claude-3-opus</option>
              <option>claude-3-sonnet</option>
              <option>gemini-1.5-pro</option>
            </select>
          </div>
          <div class="help">Included — список путей; Stats — оценка токенов и долей окна модели.</div>
        </div>

        <div class="block">
          <h3><span class="codicon codicon-tools"></span> Utilities</h3>
          <div class="row">
            <button id="btn-starter" title="Создать lg-cfg/config.yaml и пример шаблона">
              <span class="codicon codicon-new-file"></span> Create Starter Config
            </button>
            <button id="btn-doctor" title="Проверка окружения и конфигурации">
              <span class="codicon codicon-pulse"></span> Doctor
            </button>
            <span class="spacer"></span>
            <button id="btn-settings" title="Открыть настройки расширения">
              <span class="codicon codicon-gear"></span> Settings
            </button>
          </div>
        </div>

        <script>
          const vscode = acquireVsCodeApi();
          const qs = (s) => document.querySelector(s);
          const qsa = (s) => Array.from(document.querySelectorAll(s));

          const ui = {
            section: qs("#section"),
            template: qs("#template"),
            modeAll: () => qs('input[name="mode"][value="all"]'),
            modeChanges: () => qs('input[name="mode"][value="changes"]'),
            model: qs("#model"),
            btnListing: qs("#btn-listing"),
            btnContext: qs("#btn-context"),
            btnIncluded: qs("#btn-included"),
            btnStats: qs("#btn-stats"),
            btnStarter: qs("#btn-starter"),
            btnDoctor: qs("#btn-doctor"),
            btnSettings: qs("#btn-settings"),
          };

          function post(type, payload) { vscode.postMessage({ type, ...payload }); }

          // events
          ui.section.addEventListener("change", () => post("setState", { state: { section: ui.section.value }}));
          qsa('input[name="mode"]').forEach(r => r.addEventListener("change", () => {
            const val = document.querySelector('input[name="mode"]:checked').value;
            post("setState", { state: { mode: val }});
          }));
          ui.template.addEventListener("change", () => post("setState", { state: { template: ui.template.value }}));
          ui.model.addEventListener("change", () => post("setState", { state: { model: ui.model.value }}));

          ui.btnListing.addEventListener("click", () => post("generateListing"));
          ui.btnContext.addEventListener("click", () => post("generateContext"));
          ui.btnIncluded.addEventListener("click", () => post("showIncluded"));
          ui.btnStats.addEventListener("click", () => post("showStats"));
          ui.btnStarter.addEventListener("click", () => post("createStarter"));
          ui.btnDoctor.addEventListener("click", () => post("doctor"));
          ui.btnSettings.addEventListener("click", () => post("openSettings"));

          window.addEventListener("message", (e) => {
            const msg = e.data;
            if (msg.type === "data") {
              fillSelect(ui.section, msg.sections);
              fillSelect(ui.template, ["— select template —", ...msg.contexts], msg.state.template || "");
              setState(msg.state);
            } else if (msg.type === "state") {
              setState(msg.state);
            }
          });

          function fillSelect(sel, items, value) {
            const cur = sel.value;
            sel.innerHTML = "";
            for (const it of items) {
              const opt = document.createElement("option");
              opt.value = it === "— select template —" ? "" : it;
              opt.textContent = it;
              sel.appendChild(opt);
            }
            sel.value = (value !== undefined ? value : cur) || "";
          }

          function setState(s) {
            if (s.section !== undefined) ui.section.value = s.section;
            if (s.template !== undefined) ui.template.value = s.template;
            if (s.model !== undefined) ui.model.value = s.model;
            if (s.mode === "changes") ui.modeChanges().checked = true; else ui.modeAll().checked = true;
          }

          // init
          post("init");
        </script>
      </body>
      </html>
    `;
    return html;
  }
}
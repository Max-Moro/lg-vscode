/**
 * Точка входа расширения. Здесь регистрируем команды, провайдеры и вьюхи.
 * Важно: активируемся по вызову команды или при наличии lg-cfg/config.yaml.
 */
import * as vscode from "vscode";
import { VirtualDocProvider } from "./views/VirtualDocProvider";
import { setVirtualProvider } from "./views/virtualBus";
import { IncludedTree } from "./views/IncludedTree";
import { showStatsWebview } from "./views/StatsWebview";
import { runDoctor } from "./diagnostics/Doctor";
import { runInitWizard } from "./starter/StarterConfig";
import { ControlPanelView } from "./views/ControlPanelView";
import { effectiveWorkspaceRoot, locateCliOrOfferInstall, runCli, setExtensionContext } from "./cli/CliResolver";
import { listContextsJson, listSectionsJson } from "./services/CatalogService";
import { runListIncludedJson, runListing } from "./services/ListingService";
import { runContext } from "./services/ContextService";
import { runStatsJson } from "./services/StatsService";
import { initLogging, showLogs, logInfo } from "./logging/log";


let virtualProvider: VirtualDocProvider;
let includedTree: IncludedTree;

export function activate(context: vscode.ExtensionContext) {
  setExtensionContext(context);
  initLogging(context);
  logInfo("Extension activated");

  // 1) Провайдер виртуальных документов (lg://listing, lg://context)
  virtualProvider = new VirtualDocProvider();
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider("lg", virtualProvider)
  );
  setVirtualProvider(virtualProvider);

  // 2) Дерево включённых путей
  includedTree = new IncludedTree(context);
  context.subscriptions.push(vscode.window.registerTreeDataProvider("lg.included", includedTree));

  // 2.1) Панель управления как webview view
  const control = new ControlPanelView(context, virtualProvider, includedTree);
  context.subscriptions.push(vscode.window.registerWebviewViewProvider("lg.control", control, { webviewOptions: { retainContextWhenHidden: true } }));
  // 2.2) Подписка на смену темы VS Code → переслать в webview (если открыт)
  context.subscriptions.push(
    vscode.window.onDidChangeActiveColorTheme(theme => {
      control.postTheme(theme.kind);
    })
  );

  // 3) Команды
  context.subscriptions.push(
    vscode.commands.registerCommand("lg.createStarterConfig", async () => {
      await runInitWizard();
    }),
    vscode.commands.registerCommand("lg.showLogs", async () => {
      showLogs();
    }),

    vscode.commands.registerCommand("lg.generateListing", async () => {
      const workspace = vscode.workspace.workspaceFolders?.[0];
      if (!workspace) {
        return vscode.window.showErrorMessage("Open a folder to use Listing Generator.");
      }
      // 1) получаем список секций и показываем QuickPick
      let section = vscode.workspace.getConfiguration().get<string>("lg.defaultSection") || "all-src";
      try {
        const secs = await listSectionsJson();
        if (secs.length) {
          const picked = await vscode.window.showQuickPick(secs, { placeHolder: "Select section to generate listing" });
          if (!picked) return;
          section = picked;
        }
      } catch {
        // игнор: fallback на настройку
      }
      const mode = (vscode.workspace.getConfiguration().get<string>("lg.mode") as "all" | "changes") || "all";
      try {
        const content = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: "LG: Generating listing…", cancellable: false },
          async () => runListing({ section, mode })
        );
        await virtualProvider.open("listing", `Listing — ${section}.md`, content);
      } catch (e: any) {
        vscode.window.showErrorMessage(`LG: ${e?.message || e}`);
      }
    }),

    vscode.commands.registerCommand("lg.generateContext", async () => {
      // QuickPick по списку контекстов
      let name = vscode.workspace.getConfiguration().get<string>("lg.defaultTemplate") || "";
      try {
        const ctxs = await listContextsJson();
        if (!ctxs.length) {
          vscode.window.showWarningMessage("No contexts (*.ctx.md) found in lg-cfg/");
          return;
        }
        const picked = await vscode.window.showQuickPick(ctxs, { placeHolder: "Select context (*.ctx.md)" });
        if (!picked) return;
        name = picked;
      } catch (e: any) {
        vscode.window.showErrorMessage(`LG: Failed to list contexts — ${e?.message || e}`);
        return;
      }
      try {
        const content = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: `LG: Generating context '${name}'…`, cancellable: false },
          async () => runContext(name)
        );
        await virtualProvider.open("context", `Context — ${name}.md`, content);
      } catch (e: any) {
        vscode.window.showErrorMessage(`LG: ${e?.message || e}`);
      }
    }),

    vscode.commands.registerCommand("lg.showIncluded", async () => {
      let section = vscode.workspace.getConfiguration().get<string>("lg.defaultSection") || "all-src";
      try {
        const secs = await listSectionsJson();
        if (secs.length) {
          const picked = await vscode.window.showQuickPick(secs, { placeHolder: "Select section to list included paths" });
          if (!picked) return;
          section = picked;
        }
      } catch {}
      const mode = (vscode.workspace.getConfiguration().get<string>("lg.mode") as "all" | "changes") || "all";
      try {
        const files = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: "LG: Collecting included paths…", cancellable: false },
          async () => runListIncludedJson({ section, mode })
        );
        includedTree.setPaths(files.map(f => f.path));
        await vscode.commands.executeCommand("workbench.view.explorer");
      } catch (e: any) {
        vscode.window.showErrorMessage(`LG: ${e?.message || e}`);
      }
    }),

    vscode.commands.registerCommand("lg.showStats", async () => {
      // Выбор секции и модели → вебвью
      let section = vscode.workspace.getConfiguration().get<string>("lg.defaultSection") || "all-src";
      try {
        const secs = await listSectionsJson();
        if (secs.length) {
          const picked = await vscode.window.showQuickPick(secs, { placeHolder: "Select section for stats" });
          if (!picked) return;
          section = picked;
        }
      } catch {}
      const mode = (vscode.workspace.getConfiguration().get<string>("lg.mode") as "all" | "changes") || "all";
      const model = vscode.workspace.getConfiguration().get<string>("lg.modelForStats") || "o3";
      try {
        const data = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: "LG: Computing stats…", cancellable: false },
          async () => runStatsJson({ section, mode, model })
        );
        // передаём замыкания для refresh и generate
        await showStatsWebview(
          data,
          () => runStatsJson({ section, mode, model }),
          () => runListing({ section, mode })
        );
      } catch (e: any) {
        vscode.window.showErrorMessage(`LG: ${e?.message || e}`);
      }
    }),

    vscode.commands.registerCommand("lg.openConfig", async () => {
      const root = effectiveWorkspaceRoot();
      if (!root) {
        return vscode.window.showErrorMessage("Open a folder to use Listing Generator.");
      }
      const uri = vscode.Uri.file(require("path").join(root, "lg-cfg", "sections.yaml"));
      try {
        await vscode.workspace.fs.stat(uri);
      } catch {
        const choice = await vscode.window.showInformationMessage(
          "lg-cfg/sections.yaml not found. Create a starter config?",
          "Create", "Cancel"
        );
        if (choice === "Create") {
          await vscode.commands.executeCommand("lg.createStarterConfig");
        } else {
          return;
        }
      }
      // Повторная проверка/открытие
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, { preview: false });
      } catch (e: any) {
        vscode.window.showErrorMessage(`LG: cannot open config — ${e?.message || e}`);
      }
    }),

    vscode.commands.registerCommand("lg.runDoctor", async () => {
      await runDoctor(context);
    }),

    vscode.commands.registerCommand("lg.resetCache", async () => {
      try {
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: "LG: Resetting cache…", cancellable: false },
          async () => {
            await runCli(["diag", "--rebuild-cache"], { timeoutMs: 60_000 });
          }
        );
        vscode.window.showInformationMessage("LG cache has been reset.");
      } catch (e: any) {
        vscode.window.showErrorMessage(`LG: Failed to reset cache — ${e?.message || e}`);
      }
    }),

    // Переключатель вида: плоский/дерево
    vscode.commands.registerCommand("lg.toggleIncludedViewMode", async () => {
      includedTree.toggleViewMode();
      const mode = includedTree.getMode();
      vscode.window.setStatusBarMessage(`LG Included: ${mode === "tree" ? "Tree" : "Flat"} view`, 2000);
    })
  );

  // 4) Лёгкая проверка наличия CLI (подсказка, но не блокер)
  locateCliOrOfferInstall(context).catch(() => {
    // Мягко игнорируем — установщик появится при первом реальном запуске.
  });
}

export function deactivate() {}

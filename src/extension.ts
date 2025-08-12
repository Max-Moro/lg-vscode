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
import { ensureStarterConfig } from "./starter/StarterConfig";
import {
  locateCliOrOfferInstall,
  runListing,
  runContext,
  setExtensionContext,
  listSectionsJson,
  listContextsJson,
  runListIncludedJson,
  runStatsJson
} from "./runner/LgLocator";
import { ControlPanelView } from "./views/ControlPanelView";


let virtualProvider: VirtualDocProvider;
let includedTree: IncludedTree;

export function activate(context: vscode.ExtensionContext) {
  setExtensionContext(context);

  // 1) Провайдер виртуальных документов (lg://listing, lg://context)
  virtualProvider = new VirtualDocProvider();
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider("lg", virtualProvider)
  );
  setVirtualProvider(virtualProvider);

  // 2) Дерево включённых путей
  includedTree = new IncludedTree();
  context.subscriptions.push(vscode.window.registerTreeDataProvider("lg.included", includedTree));

  // 2.1) Панель управления как webview view
  const control = new ControlPanelView(context, virtualProvider, includedTree);
  context.subscriptions.push(vscode.window.registerWebviewViewProvider("lg.control", control, { webviewOptions: { retainContextWhenHidden: true } }));

  // 3) Команды
  context.subscriptions.push(
    vscode.commands.registerCommand("lg.createStarterConfig", async () => {
      await ensureStarterConfig();
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
          vscode.window.showWarningMessage("No context templates found in lg-cfg/contexts/");
          return;
        }
        const picked = await vscode.window.showQuickPick(ctxs, { placeHolder: "Select context template" });
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
        vscode.commands.executeCommand("lg.included.focus");
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
        await showStatsWebview(data);
      } catch (e: any) {
        vscode.window.showErrorMessage(`LG: ${e?.message || e}`);
      }
    }),

    vscode.commands.registerCommand("lg.runDoctor", async () => {
      await runDoctor(context);
    }),

    vscode.commands.registerCommand("lg.reRunLast", async () => {
      vscode.window.showInformationMessage("Re-run last: пока заглушка. Скоро подключим Runner.");
    })
  );

  // 4) Лёгкая проверка наличия CLI (подсказка, но не блокер)
  locateCliOrOfferInstall(context).catch(() => {
    // Мягко игнорируем — установщик появится при первом реальном запуске.
  });
}

export function deactivate() {}

/**
 * Точка входа расширения. Здесь регистрируем команды, провайдеры и вьюхи.
 * Важно: активируемся по вызову команды или при наличии lg-cfg/config.yaml.
 */
import * as vscode from "vscode";
import { VirtualDocProvider } from "./views/VirtualDocProvider";
import { IncludedTree } from "./views/IncludedTree";
import { showStatsWebview } from "./views/StatsWebview";
import { runDoctor } from "./diagnostics/Doctor";
import { ensureStarterConfig } from "./starter/StarterConfig";
import { locateCliOrOfferInstall, runListing, runListIncluded, runContext, setExtensionContext } from "./runner/LgLocator";


let virtualProvider: VirtualDocProvider;
let includedTree: IncludedTree;

export function activate(context: vscode.ExtensionContext) {
  setExtensionContext(context);

  // 1) Провайдер виртуальных документов (lg://listing, lg://context)
  virtualProvider = new VirtualDocProvider();
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider("lg", virtualProvider)
  );

  // 2) Дерево включённых путей
  includedTree = new IncludedTree();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("lg.included", includedTree)
  );

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
      // предлагается выбрать секцию из config.yaml, но на этом шаге возьмём настройку или "all"
      const section = vscode.workspace.getConfiguration().get<string>("lg.defaultSection") || "all";
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
      // просто спросим имя шаблона (без .tpl.md)
      const name = await vscode.window.showInputBox({
        title: "LG — Template name (without .tpl.md)",
        value: vscode.workspace.getConfiguration().get<string>("lg.defaultTemplate") || ""
      });
      if (!name) return;
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
      const section = vscode.workspace.getConfiguration().get<string>("lg.defaultSection") || "all";
      const mode = (vscode.workspace.getConfiguration().get<string>("lg.mode") as "all" | "changes") || "all";
      try {
        const paths = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: "LG: Collecting included paths…", cancellable: false },
          async () => runListIncluded({ section, mode })
        );
        includedTree.setPaths(paths);
        await vscode.commands.executeCommand("workbench.view.explorer");
        vscode.commands.executeCommand("lg.included.focus");
      } catch (e: any) {
        vscode.window.showErrorMessage(`LG: ${e?.message || e}`);
      }
    }),

    vscode.commands.registerCommand("lg.showStats", async () => {
      await showStatsWebview();
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

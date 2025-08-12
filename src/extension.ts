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
import { locateCliOrOfferInstall, runLgTextCommandStub } from "./runner/LgLocator";

let virtualProvider: VirtualDocProvider;
let includedTree: IncludedTree;

export function activate(context: vscode.ExtensionContext) {
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
      // MVP: вместо реального запуска CLI — stub. Следующей итерацией заменим на Runner.
      const workspace = vscode.workspace.workspaceFolders?.[0];
      if (!workspace) {
        return vscode.window.showErrorMessage("Open a folder to use Listing Generator.");
      }
      // Демонстрация UX: откроем виртуальный документ
      const content = [
        "# Listing Generator — Placeholder",
        "",
        "Здесь будет реальный листинг из Python CLI.",
        "Следующим шагом подключим запуск `listing-generator` через Runner."
      ].join("\n");
      await virtualProvider.open("listing", "Generated Listing.md", content);
      // Обновим дерево "included" демонстрационными путями
      includedTree.setPaths(["src/app.py", "core/utils.py", "README.md"]);
    }),

    vscode.commands.registerCommand("lg.generateContext", async () => {
      const content = [
        "# Context Prompt — Placeholder",
        "",
        "Здесь будет сгенерированный промт по шаблону."
      ].join("\n");
      await virtualProvider.open("context", "Generated Context.md", content);
    }),

    vscode.commands.registerCommand("lg.showIncluded", async () => {
      // просто сфокусироваться на TreeView
      await vscode.commands.executeCommand("workbench.view.explorer");
      vscode.commands.executeCommand("lg.included.focus");
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

/**
 * Точка входа расширения. Здесь регистрируем команды, провайдеры и вьюхи.
 * Важно: активируемся по вызову команды или при наличии lg-cfg/config.yaml.
 */
import * as vscode from "vscode";
import { VirtualDocProvider } from "./views/VirtualDocProvider";
import { setVirtualProvider } from "./views/virtualBus";
import { IncludedTree } from "./views/IncludedTree";
import { ControlPanelView } from "./views/ControlPanelView";
import { locateCliOrOfferInstall, setExtensionContext } from "./cli/CliResolver";
import { initLogging, showLogs, logInfo } from "./logging/log";
import { runAiDiagnostics } from "./commands/aiDiagnostics";


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
    vscode.commands.registerCommand("lg.showLogs", async () => {
      showLogs();
    }),

    // Переключатель вида: плоский/дерево
    vscode.commands.registerCommand("lg.toggleIncludedViewMode", async () => {
      includedTree.toggleViewMode();
      const mode = includedTree.getMode();
      vscode.window.setStatusBarMessage(`LG Included: ${mode === "tree" ? "Tree" : "Flat"} view`, 2000);
    }),

    // Диагностика AI-провайдеров
    vscode.commands.registerCommand("lg.aiDiagnostics", async () => {
      await runAiDiagnostics();
    })
  );

  // 4) Лёгкая проверка наличия CLI (подсказка, но не блокер)
  locateCliOrOfferInstall(context).catch(() => {
    // Мягко игнорируем — установщик появится при первом реальном запуске.
  });
}

export function deactivate() {}

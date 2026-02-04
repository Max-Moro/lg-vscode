/**
 * Extension entry point.
 * Registers commands, providers, and views.
 * All initialization delegated to bootstrap().
 */
import * as vscode from "vscode";
import { bootstrap, shutdown } from "./bootstrap";
import { ToolbarActions } from "./actions";
import { setVirtualProvider } from "./views/virtualBus";
import { ControlPanelView } from "./views/ControlPanelView";
import { locateCliOrOfferInstall } from "./cli/CliResolver";
import { showLogs } from "./logging/log";

export function activate(context: vscode.ExtensionContext) {
  // 1. Bootstrap all singletons and services
  const { vdocs, includedTree } = bootstrap(context);

  // 2. Register virtual document provider
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider("lg", vdocs)
  );
  setVirtualProvider(vdocs);

  // 3. Register tree data provider
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("lg.included", includedTree)
  );

  // 4. Register Control Panel webview
  const control = new ControlPanelView();
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("lg.control", control, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  // 5. Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("lg.showLogs", showLogs),

    vscode.commands.registerCommand("lg.toggleIncludedViewMode", () => {
      includedTree.toggleViewMode();
      const mode = includedTree.getMode();
      vscode.window.setStatusBarMessage(`LG Included: ${mode === "tree" ? "Tree" : "Flat"} view`, 2000);
    }),

    // Toolbar commands
    vscode.commands.registerCommand("lg.refreshCatalogs", () => ToolbarActions.refreshCatalogs()),
    vscode.commands.registerCommand("lg.createStarter", () => ToolbarActions.createStarter()),
    vscode.commands.registerCommand("lg.doctor", () => ToolbarActions.doctor()),
    vscode.commands.registerCommand("lg.resetCache", () => ToolbarActions.resetCacheAction()),
    vscode.commands.registerCommand("lg.openSettings", () => ToolbarActions.openSettings()),
    vscode.commands.registerCommand("lg.updateAiModes", () => ToolbarActions.updateAiModes()),
    vscode.commands.registerCommand("lg.clearState", () => ToolbarActions.clearState())
  );

  // 6. Quick CLI presence check
  locateCliOrOfferInstall().catch(() => {
    // Silently ignore — installer will appear on first real run.
  });
}

export function deactivate() {
  shutdown();
}

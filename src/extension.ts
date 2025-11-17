/**
 * Extension entry point. Commands, providers, and views are registered here.
 * Important: Activated by command invocation or when lg-cfg/config.yaml is present.
 */
import * as vscode from "vscode";
import { VirtualDocProvider } from "./views/VirtualDocProvider";
import { setVirtualProvider } from "./views/virtualBus";
import { IncludedTree } from "./views/IncludedTree";
import { ControlPanelView } from "./views/ControlPanelView";
import { locateCliOrOfferInstall, setExtensionContext } from "./cli/CliResolver";
import { initLogging, showLogs, logInfo, logError } from "./logging/log";
import { createAiIntegrationService, AiIntegrationService } from "./services/ai";


let virtualProvider: VirtualDocProvider;
let includedTree: IncludedTree;
let aiService: AiIntegrationService;

export function activate(context: vscode.ExtensionContext) {
  setExtensionContext(context);
  initLogging(context);
  logInfo("Extension activated");

  // Initialize AI Integration
  aiService = createAiIntegrationService(context);

  // Initial provider detection
  aiService.detectBestProvider().then(async (bestProviderId) => {
    const config = vscode.workspace.getConfiguration();
    const inspection = config.inspect<string>("lg.ai.provider");

    // Check if the setting is explicitly set (in workspace or global)
    const isExplicitlySet = inspection?.workspaceValue !== undefined || inspection?.globalValue !== undefined;

    // If the setting is not set explicitly, offer the best option
    if (!isExplicitlySet) {
      // Skip the offer if the best option is clipboard (no better option found)
      if (bestProviderId === "clipboard") {
        return;
      }

      const providerName = aiService.getProviderName(bestProviderId);
      const choice = await vscode.window.showInformationMessage(
        `LG: Detected AI provider: ${providerName}. Set as default?`,
        "Yes",
        "Choose Another",
        "Later"
      );

      if (choice === "Yes") {
        await config.update("lg.ai.provider", bestProviderId, vscode.ConfigurationTarget.Global);
        logInfo(`AI provider set to: ${bestProviderId}`);
      } else if (choice === "Choose Another") {
        vscode.commands.executeCommand("workbench.action.openSettings", "lg.ai.provider");
      }
    }
  }).catch((e) => {
    logError("Failed to detect AI providers", e);
  });

  // 1) Virtual document provider (lg://listing, lg://context)
  virtualProvider = new VirtualDocProvider();
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider("lg", virtualProvider)
  );
  setVirtualProvider(virtualProvider);

  // 2) Included paths tree
  includedTree = new IncludedTree(context);
  context.subscriptions.push(vscode.window.registerTreeDataProvider("lg.included", includedTree));

  // 2.1) Control panel as webview view
  const control = new ControlPanelView(context, virtualProvider, includedTree);
  context.subscriptions.push(vscode.window.registerWebviewViewProvider("lg.control", control, { webviewOptions: { retainContextWhenHidden: true } }));
  // 2.2) Subscribe to VS Code theme change → send to webview (if open)
  context.subscriptions.push(
    vscode.window.onDidChangeActiveColorTheme(theme => {
      control.postTheme(theme.kind);
    })
  );

  // 3) Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("lg.showLogs", async () => {
      showLogs();
    }),

    // View mode toggle: flat/tree
    vscode.commands.registerCommand("lg.toggleIncludedViewMode", async () => {
      includedTree.toggleViewMode();
      const mode = includedTree.getMode();
      vscode.window.setStatusBarMessage(`LG Included: ${mode === "tree" ? "Tree" : "Flat"} view`, 2000);
    }),

    // Configure OpenAI API key
    vscode.commands.registerCommand("lg.ai.configureOpenAI", async () => {
      const currentKey = await context.secrets.get("lg.openai.apiKey");

      const input = await vscode.window.showInputBox({
        prompt: "Enter your OpenAI API Key",
        password: true,
        value: currentKey ? "••••••••••••" : "",
        placeHolder: "sk-..."
      });

      if (input === undefined) {
        return; // cancelled
      }

      if (!input || input === "••••••••••••") {
        return; // no change
      }

      await context.secrets.store("lg.openai.apiKey", input);
      vscode.window.showInformationMessage("OpenAI API key saved successfully");
    }),

    // Toolbar commands (delegate to Control Panel)
    vscode.commands.registerCommand("lg.refreshCatalogs", async () => {
      await control.handleCommand("refreshCatalogs");
    }),

    vscode.commands.registerCommand("lg.createStarter", async () => {
      await control.handleCommand("createStarter");
    }),

    vscode.commands.registerCommand("lg.openConfig", async () => {
      await control.handleCommand("openConfig");
    }),

    vscode.commands.registerCommand("lg.doctor", async () => {
      await control.handleCommand("doctor");
    }),

    vscode.commands.registerCommand("lg.resetCache", async () => {
      await control.handleCommand("resetCache");
    }),

    vscode.commands.registerCommand("lg.openSettings", async () => {
      await control.handleCommand("openSettings");
    })
  );

  // 4) Quick CLI presence check (suggestion, not a blocker)
  locateCliOrOfferInstall(context).catch(() => {
    // Silently ignore — installer will appear on first real run.
  });
}

// Helper function to get aiService from other modules
export function getAiService(): AiIntegrationService {
  return aiService;
}

export function deactivate() {}

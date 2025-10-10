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
import { initLogging, showLogs, logInfo, logError } from "./logging/log";
import { createAiIntegrationService, AiIntegrationService } from "./services/ai";


let virtualProvider: VirtualDocProvider;
let includedTree: IncludedTree;
let aiService: AiIntegrationService;

export function activate(context: vscode.ExtensionContext) {
  setExtensionContext(context);
  initLogging(context);
  logInfo("Extension activated");

  // Инициализация AI Integration
  aiService = createAiIntegrationService(context);
  
  // Первичная детекция провайдеров
  aiService.detectBestProvider().then(async (bestProviderId) => {
    const config = vscode.workspace.getConfiguration();
    const current = config.get<string>("lg.ai.provider");
    
    // Если настройка не установлена, предлагаем лучший вариант
    if (!current) {
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

    // Настройка OpenAI API ключа
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
    })
  );

  // 4) Лёгкая проверка наличия CLI (подсказка, но не блокер)
  locateCliOrOfferInstall(context).catch(() => {
    // Мягко игнорируем — установщик появится при первом реальном запуске.
  });
}

// Добавить функцию-хелпер для получения aiService из других модулей
export function getAiService(): AiIntegrationService {
  return aiService;
}

export function deactivate() {}

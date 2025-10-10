import * as vscode from "vscode";
import type { ProviderModule } from "./types";
import { logInfo, logDebug, logError } from "../../logging/log";

/**
 * Центральный сервис управления AI провайдерами
 */
export class AiIntegrationService {
  private providers = new Map<string, ProviderModule>();
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Регистрация провайдера
   */
  registerProvider(module: ProviderModule): void {
    this.providers.set(module.provider.id, module);
    logDebug(`AI Provider registered: ${module.provider.id} (priority: ${module.detector.priority})`);
  }

  /**
   * Первичная детекция доступных провайдеров
   * Вызывается один раз при активации расширения
   */
  async detectBestProvider(): Promise<string> {
    const available: Array<{ id: string; priority: number }> = [];

    for (const [id, module] of this.providers) {
      try {
        const isAvailable = await module.detector.detect();
        if (isAvailable) {
          available.push({ id, priority: module.detector.priority });
          logDebug(`Provider ${id} is available (priority: ${module.detector.priority})`);
        }
      } catch (e) {
        logError(`Failed to detect provider ${id}`, e);
      }
    }

    if (available.length === 0) {
      logInfo("No AI providers detected, falling back to clipboard");
      return "clipboard";
    }

    // Сортируем по убыванию приоритета
    available.sort((a, b) => b.priority - a.priority);

    const best = available[0];
    logInfo(`Best AI provider detected: ${best.id} (priority: ${best.priority})`);

    return best.id;
  }

  /**
   * Получить список всех зарегистрированных провайдеров
   */
  getProviderIds(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Получить имя провайдера по ID
   */
  getProviderName(id: string): string {
    return this.providers.get(id)?.provider.name ?? id;
  }

  /**
   * Отправить контент в указанный провайдер
   */
  async sendToProvider(providerId: string, content: string): Promise<void> {
    const module = this.providers.get(providerId);

    if (!module) {
      throw new Error(`Provider '${providerId}' not found`);
    }

    logInfo(`Sending content to provider: ${providerId}`);

    try {
      // Для OpenAI провайдера устанавливаем context
      if (providerId === "openai.api") {
        const openaiProvider = module.provider as any;
        if (openaiProvider.setContext) {
          openaiProvider.setContext(this.context);
        }
      }

      await module.provider.send(content);
      logInfo(`Successfully sent content to ${providerId}`);
    } catch (e) {
      logError(`Failed to send content to ${providerId}`, e);
      throw e;
    }
  }

  /**
   * Отправить контент в предпочтительный провайдер из настроек
   */
  async sendToPreferred(content: string): Promise<void> {
    const config = vscode.workspace.getConfiguration();
    const preferredId = config.get<string>("lg.ai.provider");

    if (!preferredId) {
      throw new Error("No AI provider configured. Please set lg.ai.provider in settings.");
    }

    await this.sendToProvider(preferredId, content);
  }

  /**
   * Общий метод для генерации и отправки контента в AI провайдер
   * с полной обработкой ошибок и UI взаимодействием
   * 
   * @param generateContent - Функция для генерации контента (асинхронная)
   * @param generateTitle - Заголовок прогресс-бара генерации (опционально)
   * @returns true если отправка успешна, false если отменена
   */
  async generateAndSend(
    generateContent: () => Promise<string>,
    generateTitle?: string
  ): Promise<boolean> {
    // 1. Проверяем наличие настроенного провайдера
    const config = vscode.workspace.getConfiguration();
    const providerId = config.get<string>("lg.ai.provider");

    if (!providerId) {
      const choice = await vscode.window.showErrorMessage(
        "No AI provider configured.",
        "Open Settings",
        "Cancel"
      );

      if (choice === "Open Settings") {
        vscode.commands.executeCommand("workbench.action.openSettings", "lg.ai.provider");
      }
      return false;
    }

    let generatedContent: string | undefined;

    try {
      // 2. Генерируем контент с прогресс-баром
      generatedContent = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: generateTitle || "LG: Generating content...",
          cancellable: false
        },
        generateContent
      );

      // 3. Отправляем в AI провайдер
      const providerName = this.getProviderName(providerId);

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Sending to ${providerName}...`,
          cancellable: false
        },
        () => this.sendToProvider(providerId, generatedContent!)
      );

      return true;
    } catch (error: any) {
      // 4. Обработка ошибок с опциями восстановления
      const providerName = this.getProviderName(providerId);

      const options = generatedContent 
        ? ["Open Settings", "Copy to Clipboard", "Cancel"]
        : ["Open Settings", "Cancel"];
      
      const choice = await vscode.window.showErrorMessage(
        `Failed to send to ${providerName}: ${error.message}`,
        ...options
      );

      if (choice === "Open Settings") {
        vscode.commands.executeCommand("workbench.action.openSettings", "lg.ai.provider");
      } else if (choice === "Copy to Clipboard" && generatedContent) {
        // Фоллбек на clipboard в случае ошибки
        await this.sendToProvider("clipboard", generatedContent);
      }

      return false;
    }
  }
}
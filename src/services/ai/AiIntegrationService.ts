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
}
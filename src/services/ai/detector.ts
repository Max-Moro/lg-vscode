/**
 * AI Provider Detection
 * 
 * Автоматическая детекция доступных AI-провайдеров в среде VS Code
 */

import * as vscode from "vscode";
import { logDebug, logTrace } from "../../logging/log";
import type { AiProvider, ProviderDetectionResult } from "./types";

/**
 * Детектор AI-провайдеров
 */
export class AiProviderDetector {
  
  /**
   * Детекция всех доступных провайдеров
   */
  static async detectProviders(): Promise<ProviderDetectionResult> {
    const detected: AiProvider[] = [];
    const checks = [
      { provider: 'cursor' as const, check: () => this.detectCursor() },
      { provider: 'copilot' as const, check: () => this.detectCopilot() },
    ];

    for (const { provider, check } of checks) {
      try {
        const available = await check();
        if (available) {
          detected.push(provider);
          logDebug(`[AiDetector] ${provider} detected and available`);
        }
      } catch (error) {
        logTrace(`[AiDetector] ${provider} detection failed: ${error}`);
      }
    }

    // Определяем рекомендуемый провайдер
    const recommended = this.selectRecommended(detected);
    const reason = this.getRecommendationReason(detected, recommended);

    logDebug(`[AiDetector] Detection result: detected=[${detected.join(', ')}], recommended=${recommended}`);

    return {
      detected,
      recommended,
      reason
    };
  }

  /**
   * Детекция Cursor AI
   */
  private static async detectCursor(): Promise<boolean> {
    // 1. Проверяем среду выполнения (Cursor vs обычный VS Code)
    const isCursorEnv = this.isCursorEnvironment();
    
    // 2. Проверяем доступность команд Cursor AI
    const hasCursorCommands = await this.checkCursorCommands();
    
    // 3. Проверяем настройки Cursor
    const hasCursorConfig = this.hasCursorConfiguration();

    logTrace(`[AiDetector] Cursor checks: env=${isCursorEnv}, commands=${hasCursorCommands}, config=${hasCursorConfig}`);
    
    // Cursor считается доступным если хотя бы 2 из 3 проверок прошли
    return [isCursorEnv, hasCursorCommands, hasCursorConfig].filter(Boolean).length >= 2;
  }

  /**
   * Детекция GitHub Copilot Chat
   */
  private static async detectCopilot(): Promise<boolean> {
    // 1. Проверяем наличие расширения GitHub Copilot Chat
    const hasCopilotExtension = this.hasCopilotExtension();
    
    // 2. Проверяем доступность команд Copilot
    const hasCopilotCommands = await this.checkCopilotCommands();
    
    // 3. Проверяем активность Copilot (залогинен ли пользователь)
    const isCopilotActive = await this.checkCopilotStatus();

    logTrace(`[AiDetector] Copilot checks: extension=${hasCopilotExtension}, commands=${hasCopilotCommands}, active=${isCopilotActive}`);
    
    // Copilot считается доступным если расширение есть и хотя бы одна из других проверок прошла
    return hasCopilotExtension && (hasCopilotCommands || isCopilotActive);
  }

  /**
   * Проверка среды Cursor
   */
  private static isCursorEnvironment(): boolean {
    // Cursor обычно имеет специфичные переменные окружения или модификации VS Code
    const envIndicators = [
      process.env.CURSOR_APP_NAME,
      process.env.CURSOR_SESSION_ID,
      (vscode.env as any).appName?.toLowerCase().includes('cursor'),
      (vscode.env as any).appRoot?.toLowerCase().includes('cursor'),
    ];
    
    return envIndicators.some(Boolean);
  }

  /**
   * Проверка команд Cursor AI
   */
  private static async checkCursorCommands(): Promise<boolean> {
    const cursorCommands = [
      'cursor.openAIPane',
      'cursor.showAIChat', 
      'cursor.ai.open',
      'workbench.action.chat.open'
    ];

    for (const command of cursorCommands) {
      try {
        await vscode.commands.executeCommand(command);
        return true;
      } catch {
        // Команда недоступна, пробуем следующую
      }
    }
    
    return false;
  }

  /**
   * Проверка наличия конфигурации Cursor
   */
  private static hasCursorConfiguration(): boolean {
    const config = vscode.workspace.getConfiguration();
    
    // Ищем настройки, специфичные для Cursor
    const cursorSettings = [
      'cursor.ai.enabled',
      'cursor.ai.model',
      'cursor.chat.enabled'
    ];
    
    return cursorSettings.some(setting => config.has(setting));
  }

  /**
   * Проверка наличия расширения GitHub Copilot Chat
   */
  private static hasCopilotExtension(): boolean {
    const copilotExtensions = [
      'github.copilot-chat',
      'github.copilot',
      'github.copilot-nightly'
    ];
    
    return copilotExtensions.some(id => {
      const ext = vscode.extensions.getExtension(id);
      return ext && ext.isActive;
    });
  }

  /**
   * Проверка команд GitHub Copilot
   */
  private static async checkCopilotCommands(): Promise<boolean> {
    const copilotCommands = [
      'github.copilot.chat.open',
      'workbench.panel.chat.view.copilot.focus',
      'github.copilot.chat.focus'
    ];

    for (const command of copilotCommands) {
      try {
        await vscode.commands.executeCommand(command);
        return true;
      } catch {
        // Команда недоступна, пробуем следующую
      }
    }
    
    return false;
  }

  /**
   * Проверка статуса GitHub Copilot (активен ли)
   */
  private static async checkCopilotStatus(): Promise<boolean> {
    try {
      // Попробуем получить статус через команду
      const status = await vscode.commands.executeCommand('github.copilot.getStatus');
      return status === 'SignedIn' || status === 'OK';
    } catch {
      // Если команда недоступна, считаем что статус неизвестен
      return false;
    }
  }

  /**
   * Выбор рекомендуемого провайдера
   */
  private static selectRecommended(detected: AiProvider[]): AiProvider {
    if (detected.length === 0) {
      return 'cursor'; // Fallback по умолчанию
    }
    
    // Приоритет: Cursor > Copilot (если доступны оба)
    if (detected.includes('cursor')) {
      return 'cursor';
    }
    
    if (detected.includes('copilot')) {
      return 'copilot';
    }
    
    return detected[0];
  }

  /**
   * Получение причины рекомендации
   */
  private static getRecommendationReason(detected: AiProvider[], recommended: AiProvider): string {
    if (detected.length === 0) {
      return 'No AI providers detected, falling back to Cursor (clipboard-based)';
    }
    
    if (detected.length === 1) {
      return `Only ${recommended} is available`;
    }
    
    if (recommended === 'cursor' && detected.includes('copilot')) {
      return 'Cursor AI preferred over Copilot (better integration)';
    }
    
    return `${recommended} selected from available providers: ${detected.join(', ')}`;
  }

  /**
   * Быстрая проверка доступности конкретного провайдера
   */
  static async isProviderAvailable(provider: AiProvider): Promise<boolean> {
    switch (provider) {
      case 'cursor':
        return this.detectCursor();
      case 'copilot':
        return this.detectCopilot();
      case 'auto':
        const result = await this.detectProviders();
        return result.detected.length > 0;
      default:
        return false;
    }
  }
}

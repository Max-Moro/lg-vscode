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
    // 1. Проверяем среду выполнения Cursor
    const isCursorEnv = this.isCursorEnvironment();
    
    // 2. Проверяем наличие конфигурации Cursor (надежный индикатор)
    const hasCursorConfig = this.hasCursorConfiguration();
    
    // 3. Проверяем наличие расширений Cursor
    const hasCursorExtensions = this.hasCursorExtensions();

    logTrace(`[AiDetector] Cursor checks: env=${isCursorEnv}, config=${hasCursorConfig}, extensions=${hasCursorExtensions}`);
    
    // Cursor считается доступным если есть среда И (конфиг ИЛИ расширения)
    return isCursorEnv && (hasCursorConfig || hasCursorExtensions);
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
    // Проверяем по appName и uriScheme (самые надежные индикаторы из диагностики)
    const envIndicators = [
      (vscode.env as any).appName?.toLowerCase().includes('cursor'),
      vscode.env.uriScheme === 'cursor',
      (vscode.env as any).appRoot?.toLowerCase().includes('cursor'),
      // Оставляем старые проверки как fallback
      process.env.CURSOR_APP_NAME,
      process.env.CURSOR_SESSION_ID,
    ];
    
    return envIndicators.some(Boolean);
  }

  /**
   * Проверка команд Cursor AI
   */
  private static async checkCursorCommands(): Promise<boolean> {
    // Используем реальные команды из диагностики
    const cursorCommands = [
      'workbench.panel.chat.view.copilot.focus', // это работает в Cursor
      'inlineChat.showHint',
      'inlineChat.hideHint',
      // Добавляем общие команды, которые могут работать
      'workbench.action.quickOpen',
      'workbench.action.showCommands'
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
      'cursor.chat',
      'cursor.composer', 
      'cursor.terminal',
      'cursor.general',
      'cursor.cpp',
      'cursor.cmdk'
    ];
    
    return cursorSettings.some(setting => {
      const inspection = config.inspect(setting);
      return inspection && (
        inspection.defaultValue !== undefined ||
        inspection.globalValue !== undefined ||
        inspection.workspaceValue !== undefined
      );
    });
  }

  /**
   * Проверка наличия расширений Cursor
   */
  private static hasCursorExtensions(): boolean {
    const cursorExtensions = [
      'anysphere.cursor-always-local',
      'anysphere.cursor-deeplink',
      'anysphere.cursor-retrieval',
      'anysphere.cursor-shadow-workspace',
      'anysphere.cursor-tokenize',
      'anysphere.cursorpyright'
    ];
    
    return cursorExtensions.some(id => {
      const ext = vscode.extensions.getExtension(id);
      return ext && ext.isActive;
    });
  }

  /**
   * Проверка наличия расширения GitHub Copilot Chat
   */
  private static hasCopilotExtension(): boolean {
    // Используем точные ID из диагностики (с учетом регистра)
    const copilotExtensions = [
      'GitHub.copilot-chat',  // Основное расширение Chat
      'GitHub.copilot',       // Основное расширение Copilot
      'github.copilot-chat',  // Fallback (старый формат)
      'github.copilot',       // Fallback (старый формат)
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
    // Используем реально работающие команды из диагностики
    const copilotCommands = [
      'workbench.action.chat.open',
      'workbench.action.chat.openInSidebar', 
      'workbench.panel.chat.view.copilot.focus'
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
   * Проверка статуса GitHub Copilot
   */
  private static async checkCopilotStatus(): Promise<boolean> {
    try {
      // Попробуем через API расширения
      const copilotExt = vscode.extensions.getExtension('GitHub.copilot-chat') || 
                        vscode.extensions.getExtension('GitHub.copilot');
      
      if (copilotExt && copilotExt.isActive && copilotExt.exports) {
        // Если расширение активно и имеет экспорты, считаем что все в порядке
        return true;
      }
      
      // Fallback: проверяем доступность команды signIn (она есть в диагностике)
      const commands = await vscode.commands.getCommands();
      return commands.includes('github.copilot.signIn');
    } catch {
      // Если ничего не работает, считаем недоступным
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

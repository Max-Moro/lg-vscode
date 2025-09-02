/**
 * GitHub Copilot Chat Provider
 * 
 * Провайдер для интеграции с GitHub Copilot Chat
 */

import * as vscode from "vscode";
import { BaseAiProvider } from "../BaseAiProvider";
import { AiProviderDetector } from "../detector";
import { logDebug, logError } from "../../../logging/log";
import type { AiContent, AiProviderOptions, AiProviderInfo } from "../types";

export class CopilotProvider extends BaseAiProvider {
  readonly id = 'copilot' as const;
  
  readonly info: AiProviderInfo = {
    name: 'GitHub Copilot Chat',
    available: false, // будет обновлено в isAvailable()
    capabilities: {
      supportsAutoOpen: true,
      supportsDirectSend: true, // Copilot поддерживает прямую отправку через API
      preferredMethod: 'api',
      recommendedMaxLength: 800000, // GitHub Copilot имеет меньший лимит контекста
    }
  };

  /**
   * Проверка доступности GitHub Copilot
   */
  async isAvailable(): Promise<boolean> {
    const available = await AiProviderDetector.isProviderAvailable('copilot');
    // Обновляем информацию о доступности
    (this.info as any).available = available;
    return available;
  }

  /**
   * Отправка контента в GitHub Copilot Chat
   */
  async sendContent(content: AiContent, options?: AiProviderOptions): Promise<void> {
    const configOptions = this.getConfigOptions();
    const finalOptions = this.mergeOptions(configOptions, options);
    
    try {
      // Сначала пытаемся прямую отправку через API
      if (this.info.capabilities.supportsDirectSend) {
        const success = await this.tryDirectSend(content, finalOptions);
        if (success) {
          await this.showNotification(content, finalOptions, true);
          return;
        }
      }
      
      // Fallback на метод clipboard
      await this.sendViaClipboard(content, finalOptions);
      
    } catch (error: any) {
      const message = `[${this.id}] Failed to send content: ${error?.message || error}`;
      logError(message);
      await this.showNotification(content, finalOptions, false);
      throw error;
    }
  }

  /**
   * Попытка прямой отправки через Copilot API
   */
  private async tryDirectSend(content: AiContent, options: AiProviderOptions): Promise<boolean> {
    try {
      // Подготавливаем сообщение для Copilot
      let message = content.content;
      if (options.addPrefix) {
        const prefix = this.createContentPrefix(content);
        message = `${prefix}\n\n${content.content}`;
      }
      
      // Пытаемся отправить через Copilot Chat API
      const result = await this.sendToCopilotChat(message);
      
      if (result) {
        // Открываем панель Copilot для отображения результата
        if (options.autoOpenPanel) {
          await this.tryAutoOpenPanel();
        }
        return true;
      }
      
      return false;
    } catch (error) {
      logDebug(`[${this.id}] Direct send failed, falling back to clipboard: ${error}`);
      return false;
    }
  }

  /**
   * Отправка сообщения в Copilot Chat
   */
  private async sendToCopilotChat(message: string): Promise<boolean> {
    try {
      // Метод 1: Попробовать через команду с параметрами
      const result = await vscode.commands.executeCommand(
        'github.copilot.chat.sendMessage',
        message
      );
      
      if (result) {
        return true;
      }
    } catch (error) {
      logDebug(`[${this.id}] sendMessage command failed: ${error}`);
    }

    try {
      // Метод 2: Попробовать через вставку в активный чат
      await vscode.commands.executeCommand('github.copilot.chat.focus');
      
      // Небольшая задержка для фокуса
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Попробовать вставить текст в активный элемент
      await vscode.commands.executeCommand('type', { text: message });
      
      return true;
    } catch (error) {
      logDebug(`[${this.id}] Chat focus and type failed: ${error}`);
    }

    return false;
  }

  /**
   * Отправка через буфер обмена (fallback метод)
   */
  private async sendViaClipboard(content: AiContent, options: AiProviderOptions): Promise<void> {
    // Подготавливаем финальный контент
    let finalContent = content.content;
    if (options.addPrefix) {
      const prefix = this.createContentPrefix(content);
      finalContent = `${prefix}\n\n${content.content}`;
    }
    
    // Копируем в буфер обмена
    await this.copyToClipboard(finalContent);
    
    // Пытаемся автоматически открыть Copilot панель
    if (options.autoOpenPanel) {
      await this.tryAutoOpenPanel();
    }
    
    await this.showNotification(content, options, true);
  }

  /**
   * Получение детальных инструкций для пользователя
   */
  protected getDetailedInstructions(): string {
    return "1. Open GitHub Copilot Chat panel\n" +
           "2. Paste content (Ctrl+V or Cmd+V) if not auto-sent\n" +
           "3. Ask your questions about the code!";
  }

  /**
   * Попытка автоматического открытия Copilot панели
   */
  protected async tryAutoOpenPanel(): Promise<boolean> {
    const possibleCommands = [
      'github.copilot.chat.open',
      'workbench.panel.chat.view.copilot.focus',
      'github.copilot.chat.focus',
      'workbench.action.chat.open',
      'github.copilot.openChat'
    ];
    
    for (const command of possibleCommands) {
      try {
        await vscode.commands.executeCommand(command);
        logDebug(`[${this.id}] Successfully executed command: ${command}`);
        return true;
      } catch (error) {
        logDebug(`[${this.id}] Command ${command} failed: ${error}`);
        // Продолжаем пробовать следующие команды
      }
    }
    
    logDebug(`[${this.id}] Failed to auto-open Copilot Chat via any known command`);
    return false;
  }

  /**
   * Получение рекомендаций специфичных для Copilot
   */
  getContentRecommendations(content: AiContent): { warnings: string[]; suggestions: string[] } {
    const base = super.getContentRecommendations(content);
    
    // Добавляем специфичные для Copilot рекомендации
    if (content.content.length > 400000) { // 400KB
      base.warnings.push('GitHub Copilot has smaller context limits compared to other AI providers');
      base.suggestions.push('Consider breaking content into smaller, focused chunks for better results');
    }
    
    if (content.type === 'context' && content.metadata.fileCount && content.metadata.fileCount > 50) {
      base.warnings.push('Large contexts may exceed Copilot\'s context window');
      base.suggestions.push('Focus on specific modules or components for better assistance');
    }
    
    // Copilot лучше работает с конкретными вопросами
    if (content.type === 'listing') {
      base.suggestions.push('Ask specific questions about the code after sending for best results');
      base.suggestions.push('Copilot excels at explaining specific functions or suggesting improvements');
    }
    
    return base;
  }


}

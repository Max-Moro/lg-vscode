/**
 * Cursor AI Provider
 * 
 * Провайдер для интеграции с Cursor AI через clipboard + команды
 */

import * as vscode from "vscode";
import { BaseAiProvider } from "../BaseAiProvider";
import { AiProviderDetector } from "../detector";
import { logDebug, logError } from "../../../logging/log";
import type { AiContent, AiProviderOptions, AiProviderInfo } from "../types";

export class CursorAiProvider extends BaseAiProvider {
  readonly id = 'cursor' as const;
  
  readonly info: AiProviderInfo = {
    name: 'Cursor AI',
    available: false, // будет обновлено в isAvailable()
    capabilities: {
      supportsAutoOpen: true,
      supportsDirectSend: false,
      preferredMethod: 'clipboard',
      recommendedMaxLength: 1000000, // 1MB примерно
    }
  };

  /**
   * Проверка доступности Cursor AI
   */
  async isAvailable(): Promise<boolean> {
    const available = await AiProviderDetector.isProviderAvailable('cursor');
    // Обновляем информацию о доступности
    (this.info as any).available = available;
    return available;
  }

  /**
   * Отправка контента в Cursor AI
   */
  async sendContent(content: AiContent, options?: AiProviderOptions): Promise<void> {
    const configOptions = this.getConfigOptions();
    const finalOptions = this.mergeOptions(configOptions, options);
    
    try {
      // Подготавливаем финальный контент
      let finalContent = content.content;
      if (finalOptions.addPrefix) {
        const prefix = this.createContentPrefix(content);
        finalContent = `${prefix}\n\n${content.content}`;
      }
      
      // Копируем в буфер обмена
      await this.copyToClipboard(finalContent);
      
      // Пытаемся автоматически открыть Cursor AI панель
      if (finalOptions.autoOpenPanel) {
        await this.tryAutoOpenPanel();
      }
      
      // Показываем уведомление
      await this.showNotification(content, finalOptions, true);
      
    } catch (error: any) {
      const message = `[${this.id}] Failed to send content: ${error?.message || error}`;
      logError(message);
      await this.showNotification(content, finalOptions, false);
      throw error;
    }
  }

  /**
   * Получение детальных инструкций для пользователя
   */
  protected getDetailedInstructions(): string {
    return "1. Open Cursor AI Pane (Ctrl+L or Cmd+L)\n" +
           "2. Paste content (Ctrl+V or Cmd+V)\n" +
           "3. Start your conversation!";
  }

  /**
   * Попытка автоматического открытия Cursor AI панели
   */
  protected async tryAutoOpenPanel(): Promise<boolean> {
    const possibleCommands = [
      'cursor.openAIPane',
      'cursor.showAIChat',
      'cursor.ai.open',
      'workbench.action.chat.open',
      'workbench.panel.chat.view.copilot.focus', // fallback для случаев с Copilot в Cursor
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
    
    logDebug(`[${this.id}] Failed to auto-open Cursor AI Pane via any known command`);
    return false;
  }

  /**
   * Получение рекомендаций специфичных для Cursor
   */
  getContentRecommendations(content: AiContent): { warnings: string[]; suggestions: string[] } {
    const base = super.getContentRecommendations(content);
    
    // Добавляем специфичные для Cursor рекомендации
    if (content.content.length > 500000) { // 500KB
      base.suggestions.push('Cursor AI works best with content under 500KB for optimal performance');
    }
    
    if (content.type === 'context' && content.metadata.fileCount && content.metadata.fileCount > 100) {
      base.warnings.push('Large contexts with 100+ files may cause Cursor AI to respond slowly');
      base.suggestions.push('Consider splitting into multiple focused contexts');
    }
    
    // Cursor хорошо работает с code fences
    if (content.type === 'listing' && !content.content.includes('```')) {
      base.suggestions.push('Content without code fences may be less effectively processed by Cursor');
    }
    
    return base;
  }


}

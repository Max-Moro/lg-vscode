/**
 * GitHub Copilot Chat Provider
 * 
 * Провайдер для интеграции с GitHub Copilot Chat через рабочие команды
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
      supportsDirectSend: true,
      preferredMethod: 'api',
      recommendedMaxLength: 800000,
    }
  };

  constructor() {
    super();
  }

  /**
   * Получение настроек специфичных для Copilot
   */
  private getCopilotSpecificOptions(): { startNewChat: boolean } {
    const cfg = vscode.workspace.getConfiguration();
    return {
      startNewChat: cfg.get<boolean>("lg.ai.copilot.startNewChat", true)
    };
  }

  /**
   * Очистка контекста редактора (выделение, фокус) чтобы избежать автоматического прикрепления к Copilot чату
   */
  private async clearEditorContext(): Promise<void> {
    try {
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor) {
        // Убираем выделение
        activeEditor.selection = new vscode.Selection(
          activeEditor.selection.active,
          activeEditor.selection.active
        );
        logDebug(`[${this.id}] Selection cleared`);
      }
      
      // Переводим фокус на Copilot панель, чтобы редактор не был активным при создании чата
      try {
        await vscode.commands.executeCommand('workbench.action.chat.openInSidebar');
        logDebug(`[${this.id}] Focus moved to Copilot panel`);
      } catch (error) {
        // Fallback: переводим фокус на explorer
        await vscode.commands.executeCommand('workbench.view.explorer');
        logDebug(`[${this.id}] Fallback: focus moved to explorer`);
      }
      
    } catch (error) {
      // Если не удалось очистить контекст, продолжаем без ошибки
      logDebug(`[${this.id}] Failed to clear editor context: ${error}`);
    }
  }

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
    const copilotOptions = this.getCopilotSpecificOptions();
    const finalOptions = this.mergeOptions(configOptions, options);
    
    try {
      // Подготавливаем сообщение
      let message = content.content;
      if (finalOptions.addPrefix) {
        const prefix = this.createContentPrefix(content);
        message = `${prefix}\n\n${content.content}`;
      }

      // Создаем новый чат если требуется
      if (copilotOptions.startNewChat) {
        // Убираем выделение и фокус с активного редактора, чтобы избежать автоматического прикрепления контекста
        await this.clearEditorContext();
        await vscode.commands.executeCommand('workbench.action.chat.newChat');
        logDebug(`[${this.id}] New chat created without editor context`);
      }

      // Отправляем контент напрямую
      await vscode.commands.executeCommand('workbench.action.chat.open', { query: message });
      logDebug(`[${this.id}] Content sent successfully`);
      
    } catch (error: any) {
      const message = `[${this.id}] Failed to send content: ${error?.message || error}`;
      logError(message);
      throw error;
    }
  }



  /**
   * Получение детальных инструкций для пользователя
   */
  protected getDetailedInstructions(): string {
    return "Content sent directly to GitHub Copilot Chat";
  }

  /**
   * Попытка автоматического открытия Copilot панели
   */
  protected async tryAutoOpenPanel(): Promise<boolean> {
    // Не нужно - уже открывается через workbench.action.chat.open в sendContent
    return true;
  }

  /**
   * Получение рекомендаций специфичных для Copilot
   */
  getContentRecommendations(content: AiContent): { warnings: string[]; suggestions: string[] } {
    const base = super.getContentRecommendations(content);
    
    if (content.content.length > 400000) { // 400KB
      base.warnings.push('GitHub Copilot Chat has smaller context limits than other AI providers');
    }
    
    return base;
  }


}

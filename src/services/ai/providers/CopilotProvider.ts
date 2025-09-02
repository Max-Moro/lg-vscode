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
   * Проверка настройки chat.implicitContext для panel
   */
  private isImplicitContextDisabled(): boolean {
    const config = vscode.workspace.getConfiguration();
    const implicitContext = config.get<any>('chat.implicitContext.enabled');
    
    // Если настройка явно отключает implicit context для panel, то создавать пустышку не нужно
    if (implicitContext && typeof implicitContext === 'object') {
      return implicitContext.panel === 'never';
    }
    
    return false;
  }

  /**
   * Очистка контекста редактора чтобы избежать автоматического прикрепления к Copilot чату
   */
  private async clearEditorContext(): Promise<{ restore: () => Promise<void> }> {
    const activeEditor = vscode.window.activeTextEditor;
    
    // Если нет активного редактора (например, активен webview), ничего делать не нужно
    if (!activeEditor) {
      logDebug(`[${this.id}] No active text editor, skipping context clearing`);
      return { restore: async () => {} };
    }

    // Если у пользователя отключен implicit context для panel, пустышка не нужна
    if (this.isImplicitContextDisabled()) {
      logDebug(`[${this.id}] Implicit context disabled for panel, skipping context clearing`);
      // Просто фокусируемся на Copilot панели без создания пустышки
      try {
        await vscode.commands.executeCommand('workbench.action.chat.openInSidebar');
        logDebug(`[${this.id}] Focus moved to Copilot panel (no temp doc needed)`);
      } catch (error) {
        logDebug(`[${this.id}] Failed to focus Copilot panel: ${error}`);
      }
      return { restore: async () => {} };
    }
    
    const currentSelection = activeEditor.selection;
    
    try {
      // Создаем временный пустой документ и фокусируемся на нем
      const tempDoc = await vscode.workspace.openTextDocument({
        content: '', 
        language: 'plaintext'
      });
      
      await vscode.window.showTextDocument(tempDoc, {
        preview: true,
        viewColumn: vscode.ViewColumn.Active,
        preserveFocus: false
      });
      
      logDebug(`[${this.id}] Temporary empty document created and focused`);
      
      // Фокусируемся на Copilot панели
      await vscode.commands.executeCommand('workbench.action.chat.openInSidebar');
      logDebug(`[${this.id}] Focus moved to Copilot panel`);
      
      // Возвращаем функцию восстановления
      return {
        restore: async () => {
          try {
            // Закрываем временный документ
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            
            // Восстанавливаем активный редактор и выделение
            await vscode.window.showTextDocument(activeEditor.document, {
              viewColumn: activeEditor.viewColumn,
              preserveFocus: false
            });
            
            if (currentSelection) {
              vscode.window.activeTextEditor!.selection = currentSelection;
            }
            
            logDebug(`[${this.id}] Original editor state restored`);
          } catch (error) {
            logDebug(`[${this.id}] Failed to restore editor state: ${error}`);
          }
        }
      };
      
    } catch (error) {
      logDebug(`[${this.id}] Failed to clear editor context: ${error}`);
      return { restore: async () => {} };
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
        await vscode.commands.executeCommand('workbench.action.chat.newChat');
        logDebug(`[${this.id}] New chat created`);
        
        // Небольшая задержка для стабилизации состояния чата
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Убираем выделение и фокус непосредственно перед отправкой
      const { restore } = await this.clearEditorContext();
      
      // Еще одна небольшая задержка после очистки контекста
      await new Promise(resolve => setTimeout(resolve, 50));

      try {
        // Отправляем контент напрямую
        await vscode.commands.executeCommand('workbench.action.chat.open', { query: message });
        logDebug(`[${this.id}] Content sent successfully`);
      } finally {
        // Восстанавливаем исходное состояние редактора
        await new Promise(resolve => setTimeout(resolve, 200)); // небольшая задержка перед восстановлением
        await restore();
      }
      
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

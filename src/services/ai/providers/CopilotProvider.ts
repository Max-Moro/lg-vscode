/**
 * GitHub Copilot Chat Provider
 * 
 * Провайдер для интеграции с GitHub Copilot Chat
 */

import * as vscode from "vscode";
import { BaseAiProvider } from "../BaseAiProvider";
import { AiProviderDetector } from "../detector";
import { CopilotExtensionService } from "../CopilotExtensionService";
import { logDebug, logError } from "../../../logging/log";
import type { AiContent, AiProviderOptions, AiProviderInfo } from "../types";

export class CopilotProvider extends BaseAiProvider {
  readonly id = 'copilot' as const;
  private copilotService: CopilotExtensionService;
  
  readonly info: AiProviderInfo = {
    name: 'GitHub Copilot Chat',
    available: false, // будет обновлено в isAvailable()
    capabilities: {
      supportsAutoOpen: true,
      supportsDirectSend: true, // Поддержка через VS Code Chat API и Copilot API
      preferredMethod: 'api',
      recommendedMaxLength: 800000, // GitHub Copilot имеет меньший лимит контекста
    }
  };

  constructor() {
    super();
    this.copilotService = new CopilotExtensionService();
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
      // Попробуем разные методы интеграции в порядке приоритета
      
      // 1. Прямая интеграция через Copilot Chat API
      const apiSuccess = await this.tryCopilotChatAPI(content, finalOptions, copilotOptions);
      if (apiSuccess) {
        await this.showNotification(content, finalOptions, true);
        return;
      }
      
      // 2. Интеграция через VS Code Chat Workbench API
      const workbenchSuccess = await this.tryWorkbenchChatAPI(content, finalOptions, copilotOptions);
      if (workbenchSuccess) {
        await this.showNotification(content, finalOptions, true);
        return;
      }
      
      // 3. Fallback на метод clipboard + автооткрытие
      await this.sendViaClipboard(content, finalOptions, copilotOptions);
      
    } catch (error: any) {
      const message = `[${this.id}] Failed to send content: ${error?.message || error}`;
      logError(message);
      await this.showNotification(content, finalOptions, false);
      throw error;
    }
  }

  /**
   * Попытка интеграции через Copilot Chat API
   */
  private async tryCopilotChatAPI(content: AiContent, options: AiProviderOptions, copilotOptions: { startNewChat: boolean }): Promise<boolean> {
    try {
      if (!this.copilotService.isAvailable()) {
        return false;
      }
      
      // Подготавливаем сообщение
      let message = content.content;
      if (options.addPrefix) {
        const prefix = this.createContentPrefix(content);
        message = `${prefix}\n\n${content.content}`;
      }
      
      // Используем сервис для отправки
      const success = await this.copilotService.sendContentToCopilot(message, {
        openPanel: options.autoOpenPanel,
        startNewChat: copilotOptions.startNewChat
      });
      
      if (success) {
        logDebug(`[${this.id}] Successfully sent content via CopilotExtensionService`);
        return true;
      }
      
      return false;
    } catch (error) {
      logDebug(`[${this.id}] Copilot Chat API failed: ${error}`);
      return false;
    }
  }

  /**
   * Попытка интеграции через VS Code Workbench Chat API
   */
  private async tryWorkbenchChatAPI(content: AiContent, options: AiProviderOptions, copilotOptions: { startNewChat: boolean }): Promise<boolean> {
    try {
      // Подготавливаем сообщение
      let message = content.content;
      if (options.addPrefix) {
        const prefix = this.createContentPrefix(content);
        message = `${prefix}\n\n${content.content}`;
      }
      
      // Не нужно создавать новый диалог здесь - это делается в sendViaWorkbenchAPI
      
      // Пытаемся открыть chat с предзаполненным сообщением
      // Используем реально работающие команды из диагностики
      const chatCommands = [
        // Попробуем передать query как параметр
        { command: 'workbench.action.chat.open', args: { query: message } },
        { command: 'workbench.action.chat.openInSidebar', args: { query: message } },
        // Fallback - просто открыть панель
        { command: 'workbench.action.chat.open', args: {} }
      ];
      
      for (const { command, args } of chatCommands) {
        try {
          await vscode.commands.executeCommand(command, args);
          logDebug(`[${this.id}] Successfully opened chat with command: ${command}`);
          
          // Если открыли без query, пытаемся скопировать в clipboard для ручной вставки
          if (!args.query) {
            await this.copyToClipboard(message);
          }
          
          return true;
        } catch (error) {
          logDebug(`[${this.id}] Workbench command ${command} failed: ${error}`);
        }
      }
      
      return false;
    } catch (error) {
      logDebug(`[${this.id}] Workbench Chat API failed: ${error}`);
      return false;
    }
  }



  /**
   * Отправка через буфер обмена (fallback метод)
   */
  private async sendViaClipboard(content: AiContent, options: AiProviderOptions, copilotOptions: { startNewChat: boolean }): Promise<void> {
    // Подготавливаем финальный контент
    let finalContent = content.content;
    if (options.addPrefix) {
      const prefix = this.createContentPrefix(content);
      finalContent = `${prefix}\n\n${content.content}`;
    }
    
    // Новый диалог будет создан автоматически в CopilotExtensionService
    
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
    const cfg = vscode.workspace.getConfiguration();
    const startNewChat = cfg.get<boolean>("lg.ai.copilot.startNewChat", true);
    
    if (startNewChat) {
      return "1. A new GitHub Copilot Chat dialog has been started\n" +
             "2. Paste content (Ctrl+V or Cmd+V) if not auto-sent\n" +
             "3. Start your fresh conversation with the context!\n" +
             "4. Tip: This ensures a clean context without previous chat history";
    } else {
      return "1. GitHub Copilot Chat panel is open\n" +
             "2. Paste content (Ctrl+V or Cmd+V) if not auto-sent\n" +
             "3. Continue your conversation with the new context!";
    }
  }

  /**
   * Попытка автоматического открытия Copilot панели
   */
  protected async tryAutoOpenPanel(): Promise<boolean> {
    // Используем только реально работающие команды из диагностики
    const possibleCommands = [
      'workbench.action.chat.open',
      'workbench.action.chat.openInSidebar',
      'workbench.panel.chat.view.copilot.focus'
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
    
    // Добавляем специфичные для Copilot рекомендации на основе реальных возможностей
    if (content.content.length > 400000) { // 400KB
      base.warnings.push('GitHub Copilot Chat has smaller context limits than other AI providers');
      base.suggestions.push('Break content into focused chunks using specific sections');
    }
    
    if (content.type === 'context' && content.metadata.fileCount && content.metadata.fileCount > 30) {
      base.warnings.push('Large contexts with 30+ files may overwhelm Copilot Chat');
      base.suggestions.push('Use specific sections or filter by file types for better results');
    }
    
    // Copilot хорошо работает с инструментами и конкретными задачами
    if (content.type === 'listing') {
      base.suggestions.push('Ask specific questions: "Explain this function", "Find bugs", "Suggest improvements"');
      base.suggestions.push('Use @workspace for codebase-wide questions');
      base.suggestions.push('Copilot Chat has powerful tools for file editing and code analysis');
      base.suggestions.push('New chat dialog ensures fresh context without interference from previous conversations');
    }
    
    if (content.type === 'context') {
      base.suggestions.push('Start with specific questions about the architecture or patterns');
      base.suggestions.push('Copilot can use tools to search, edit, and create files based on context');
      base.suggestions.push('Fresh chat dialog provides clean context for better understanding');
    }
    
    return base;
  }

  /**
   * Получение расширенной диагностики Copilot
   */
  getCopilotDiagnostics(): {
    service: ReturnType<CopilotExtensionService['getDiagnostics']>;
    availableTools: ReturnType<CopilotExtensionService['getAvailableTools']>;
  } {
    return {
      service: this.copilotService.getDiagnostics(),
      availableTools: this.copilotService.getAvailableTools()
    };
  }

  /**
   * Обновление состояния сервиса
   */
  refreshCopilotService(): void {
    this.copilotService.refresh();
  }
}

/**
 * Copilot Extension Service
 * 
 * Расширенная интеграция с GitHub Copilot Chat через его Language Model Tools и API
 */

import * as vscode from "vscode";
import { logDebug, logInfo, logError } from "../../logging/log";

export interface CopilotChatAPI {
  sendMessage?: (message: string) => Promise<void>;
  chat?: (message: string) => Promise<void>;
  openWithMessage?: (message: string) => Promise<void>;
  [key: string]: any;
}

export interface CopilotToolInfo {
  name: string;
  displayName: string;
  description: string;
  available: boolean;
}

/**
 * Сервис для расширенной интеграции с Copilot Chat
 */
export class CopilotExtensionService {
  private copilotExt: vscode.Extension<any> | undefined;
  private copilotChatExt: vscode.Extension<any> | undefined;
  private api: CopilotChatAPI | undefined;

  constructor() {
    this.initializeExtensions();
  }

  /**
   * Инициализация расширений Copilot
   */
  private initializeExtensions(): void {
    this.copilotExt = vscode.extensions.getExtension('GitHub.copilot');
    this.copilotChatExt = vscode.extensions.getExtension('GitHub.copilot-chat');
    
    if (this.copilotChatExt && this.copilotChatExt.isActive) {
      try {
        this.api = this.copilotChatExt.exports?.getAPI?.();
        logDebug('[CopilotExtension] API initialized successfully');
      } catch (error) {
        logDebug(`[CopilotExtension] Failed to get API: ${error}`);
      }
    }
  }

  /**
   * Проверка доступности Copilot Chat
   */
  isAvailable(): boolean {
    return !!(this.copilotChatExt && this.copilotChatExt.isActive);
  }

  /**
   * Получение информации о доступных инструментах
   */
  getAvailableTools(): CopilotToolInfo[] {
    if (!this.copilotChatExt || !this.copilotChatExt.packageJSON) {
      return [];
    }

    const tools = this.copilotChatExt.packageJSON.contributes?.languageModelTools || [];
    
    return tools.map((tool: any) => ({
      name: tool.name || 'unknown',
      displayName: tool.displayName || tool.name || 'Unknown Tool',
      description: tool.modelDescription || tool.userDescription || 'No description',
      available: true
    }));
  }

  /**
   * Отправка контента через Copilot Chat API
   */
  async sendContentToCopilot(content: string, options?: {
    openPanel?: boolean;
    addContextHint?: boolean;
  }): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      // Добавляем контекстную подсказку если нужно
      let finalContent = content;
      if (options?.addContextHint) {
        finalContent = `Please analyze the following code context from Listing Generator:\n\n${content}`;
      }

      // Пытаемся разные методы API
      if (this.api) {
        if (typeof this.api.sendMessage === 'function') {
          await this.api.sendMessage(finalContent);
          logInfo('[CopilotExtension] Content sent via API.sendMessage');
          return true;
        }
        
        if (typeof this.api.chat === 'function') {
          await this.api.chat(finalContent);
          logInfo('[CopilotExtension] Content sent via API.chat');
          return true;
        }
        
        if (typeof this.api.openWithMessage === 'function') {
          await this.api.openWithMessage(finalContent);
          logInfo('[CopilotExtension] Content sent via API.openWithMessage');
          return true;
        }
      }

      // Fallback: используем workbench команды с параметрами
      return await this.sendViaWorkbenchAPI(finalContent, options?.openPanel);

    } catch (error) {
      logError(`[CopilotExtension] Failed to send content: ${error}`);
      return false;
    }
  }

  /**
   * Отправка через VS Code Workbench API
   */
  private async sendViaWorkbenchAPI(content: string, openPanel: boolean = true): Promise<boolean> {
    try {
      const commands = [
        // Пытаемся передать content как query
        { cmd: 'workbench.action.chat.open', args: { query: content, isPartialQuery: false } },
        { cmd: 'workbench.action.chat.openInSidebar', args: { query: content } },
        
        // Fallback: открываем панель без content
        ...(openPanel ? [
          { cmd: 'workbench.action.chat.open', args: {} },
          { cmd: 'workbench.panel.chat.view.copilot.focus', args: {} }
        ] : [])
      ];

      for (const { cmd, args } of commands) {
        try {
          await vscode.commands.executeCommand(cmd, args);
          logDebug(`[CopilotExtension] Successfully executed: ${cmd}`);
          
          // Если открыли без query, копируем в clipboard
          if (!args.query && openPanel) {
            await vscode.env.clipboard.writeText(content);
            logDebug('[CopilotExtension] Content copied to clipboard as fallback');
          }
          
          return true;
        } catch (error) {
          logDebug(`[CopilotExtension] Command ${cmd} failed: ${error}`);
        }
      }

      return false;
    } catch (error) {
      logError(`[CopilotExtension] Workbench API failed: ${error}`);
      return false;
    }
  }

  /**
   * Использование конкретного Language Model Tool
   */
  async useLanguageModelTool(toolName: string, input: any): Promise<any> {
    if (!this.isAvailable()) {
      throw new Error('Copilot Chat extension not available');
    }

    try {
      // Попытка использовать инструмент через API
      if (this.api && typeof this.api.useTool === 'function') {
        return await this.api.useTool(toolName, input);
      }

      // Альтернативный способ через Language Model API
      const languageModels = await vscode.lm.selectChatModels({
        vendor: 'copilot'
      });

      if (languageModels.length > 0) {
        // Используем Language Model с инструментом
        logDebug(`[CopilotExtension] Using Language Model with tool: ${toolName}`);
        // Здесь можно реализовать специфичную логику для конкретных инструментов
        return null;
      }

      throw new Error('No suitable method found to use Language Model Tool');
    } catch (error) {
      logError(`[CopilotExtension] Failed to use tool ${toolName}: ${error}`);
      throw error;
    }
  }

  /**
   * Создание файла через Copilot (используя copilot_createFile tool)
   */
  async createFileWithCopilot(filePath: string, content: string): Promise<boolean> {
    try {
      return await this.useLanguageModelTool('copilot_createFile', {
        filePath,
        content
      });
    } catch (error) {
      logError(`[CopilotExtension] Failed to create file: ${error}`);
      return false;
    }
  }

  /**
   * Редактирование файла через Copilot (используя copilot_insertEdit tool)
   */
  async editFileWithCopilot(filePath: string, explanation: string, code: string): Promise<boolean> {
    try {
      return await this.useLanguageModelTool('copilot_insertEdit', {
        explanation,
        filePath,
        code
      });
    } catch (error) {
      logError(`[CopilotExtension] Failed to edit file: ${error}`);
      return false;
    }
  }

  /**
   * Поиск в кодовой базе через Copilot (используя copilot_searchCodebase tool)
   */
  async searchCodebaseWithCopilot(query: string): Promise<any> {
    try {
      return await this.useLanguageModelTool('copilot_searchCodebase', {
        query
      });
    } catch (error) {
      logError(`[CopilotExtension] Failed to search codebase: ${error}`);
      return null;
    }
  }

  /**
   * Получение статистики и диагностики
   */
  getDiagnostics(): {
    copilotExtension: boolean;
    copilotChatExtension: boolean;
    apiAvailable: boolean;
    availableTools: number;
    extensionVersions: { copilot?: string; copilotChat?: string };
  } {
    return {
      copilotExtension: !!(this.copilotExt && this.copilotExt.isActive),
      copilotChatExtension: !!(this.copilotChatExt && this.copilotChatExt.isActive),
      apiAvailable: !!this.api,
      availableTools: this.getAvailableTools().length,
      extensionVersions: {
        copilot: this.copilotExt?.packageJSON?.version,
        copilotChat: this.copilotChatExt?.packageJSON?.version
      }
    };
  }

  /**
   * Обновление/переинициализация API
   */
  refresh(): void {
    this.initializeExtensions();
  }
}

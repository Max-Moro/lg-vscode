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
    startNewChat?: boolean;
  }): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      // Пытаемся разные методы API
      if (this.api) {
        if (typeof this.api.sendMessage === 'function') {
          await this.api.sendMessage(content);
          logInfo('[CopilotExtension] Content sent via API.sendMessage');
          return true;
        }
        
        if (typeof this.api.chat === 'function') {
          await this.api.chat(content);
          logInfo('[CopilotExtension] Content sent via API.chat');
          return true;
        }
        
        if (typeof this.api.openWithMessage === 'function') {
          await this.api.openWithMessage(content);
          logInfo('[CopilotExtension] Content sent via API.openWithMessage');
          return true;
        }
      }

      // Fallback: используем workbench команды с параметрами
      return await this.sendViaWorkbenchAPI(content, options?.openPanel, options?.startNewChat);

    } catch (error) {
      logError(`[CopilotExtension] Failed to send content: ${error}`);
      return false;
    }
  }

  /**
   * Отправка через VS Code Workbench API
   */
  private async sendViaWorkbenchAPI(content: string, openPanel: boolean = true, startNewChat: boolean = false): Promise<boolean> {
    try {
      if (startNewChat) {
        // Для нового диалога: пошаговый подход
        return await this.sendToNewChat(content, openPanel);
      } else {
        // Старое поведение: добавляем в текущий диалог
        return await this.sendToCurrentChat(content, openPanel);
      }
    } catch (error) {
      logError(`[CopilotExtension] Workbench API failed: ${error}`);
      return false;
    }
  }

  /**
   * Отправка контента в новый диалог (пошаговая логика)
   */
  private async sendToNewChat(content: string, openPanel: boolean): Promise<boolean> {
    try {
      // Шаг 1: Создаем новый диалог
      let newChatSuccess = false;
      const newChatCommands = ['workbench.action.chat.newChat', 'workbench.action.chat.clear'];
      
      for (const cmd of newChatCommands) {
        try {
          await vscode.commands.executeCommand(cmd);
          logDebug(`[CopilotExtension] Successfully executed: ${cmd}`);
          newChatSuccess = true;
          break;
        } catch (error) {
          logDebug(`[CopilotExtension] Command ${cmd} failed: ${error}`);
        }
      }

      // Небольшая задержка для стабилизации UI
      if (newChatSuccess) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Шаг 2: Отправляем контент в новый диалог
      const success = await this.sendContentToChat(content, openPanel);
      
      // Если прямая отправка не сработала, попробуем вставить текст напрямую
      if (!success) {
        return await this.insertTextDirectly(content, openPanel);
      }
      
      return success;
    } catch (error) {
      logError(`[CopilotExtension] Failed to send to new chat: ${error}`);
      return false;
    }
  }

  /**
   * Отправка контента в текущий диалог
   */
  private async sendToCurrentChat(content: string, openPanel: boolean): Promise<boolean> {
    return await this.sendContentToChat(content, openPanel);
  }

  /**
   * Универсальная отправка контента в чат
   */
  private async sendContentToChat(content: string, openPanel: boolean): Promise<boolean> {
    // Сначала пытаемся использовать команды с query параметром
    const queryCommands = [
      { cmd: 'workbench.action.chat.open', args: { query: content, isPartialQuery: false } },
      { cmd: 'workbench.action.chat.openInSidebar', args: { query: content } },
      { cmd: 'workbench.action.chat.sendQuery', args: { query: content } }
    ];

    // Попробуем команды с query
    for (const { cmd, args } of queryCommands) {
      try {
        await vscode.commands.executeCommand(cmd, args);
        logDebug(`[CopilotExtension] Successfully sent content via: ${cmd}`);
        return true;
      } catch (error) {
        logDebug(`[CopilotExtension] Command ${cmd} with query failed: ${error}`);
      }
    }
    
    // Если команды с query не сработали, открываем панель и копируем в clipboard
    const fallbackCommands = [
      { cmd: 'workbench.action.chat.open', args: {} },
      { cmd: 'workbench.action.chat.openInSidebar', args: {} },
      { cmd: 'workbench.panel.chat.view.copilot.focus', args: {} }
    ];

    // Пытаемся открыть панель как fallback
    if (openPanel) {
      for (const { cmd, args } of fallbackCommands) {
        try {
          await vscode.commands.executeCommand(cmd, args);
          logDebug(`[CopilotExtension] Successfully executed fallback: ${cmd}`);
          
          // Копируем контент в clipboard для ручной вставки
          await vscode.env.clipboard.writeText(content);
          logDebug('[CopilotExtension] Content copied to clipboard as fallback');
          
          return true;
        } catch (error) {
          logDebug(`[CopilotExtension] Fallback command ${cmd} failed: ${error}`);
        }
      }
    }

    return false;
  }

  /**
   * Прямая вставка текста в активное поле ввода
   */
  private async insertTextDirectly(content: string, openPanel: boolean): Promise<boolean> {
    try {
      // Сначала убеждаемся что панель чата открыта
      if (openPanel) {
        const openCommands = [
          'workbench.action.chat.open',
          'workbench.action.chat.openInSidebar',
          'workbench.panel.chat.view.copilot.focus'
        ];
        
        for (const cmd of openCommands) {
          try {
            await vscode.commands.executeCommand(cmd);
            logDebug(`[CopilotExtension] Opened chat panel via: ${cmd}`);
            break;
          } catch (error) {
            logDebug(`[CopilotExtension] Failed to open via ${cmd}: ${error}`);
          }
        }
        
        // Короткая задержка для стабилизации UI
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // Копируем в буфер обмена
      await vscode.env.clipboard.writeText(content);
      logDebug(`[CopilotExtension] Content copied to clipboard for direct insertion`);
      
      // Пытаемся вставить через команду вставки
      try {
        await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
        logDebug(`[CopilotExtension] Successfully executed paste command`);
        return true;
      } catch (error) {
        logDebug(`[CopilotExtension] Paste command failed: ${error}`);
      }
      
      // Если вставка не сработала, просто оставляем в буфере обмена
      logDebug(`[CopilotExtension] Content available in clipboard for manual paste`);
      return true;
      
    } catch (error) {
      logError(`[CopilotExtension] Failed to insert text directly: ${error}`);
      return false;
    }
  }

  /**
   * Создание нового диалога в Copilot Chat
   */
  async startNewChatDialog(): Promise<boolean> {
    try {
      // Пытаемся различные команды для создания нового диалога
      const newChatCommands = [
        'workbench.action.chat.newChat',
        'workbench.action.chat.clear',
        'workbench.action.chat.clearHistory'
      ];
      
      for (const command of newChatCommands) {
        try {
          await vscode.commands.executeCommand(command);
          logDebug(`[CopilotExtension] New chat started with command: ${command}`);
          return true;
        } catch (error) {
          logDebug(`[CopilotExtension] Command ${command} failed: ${error}`);
        }
      }
      
      logDebug('[CopilotExtension] No new chat commands worked, continuing with regular flow');
      return false;
    } catch (error) {
      logError(`[CopilotExtension] Failed to start new chat: ${error}`);
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

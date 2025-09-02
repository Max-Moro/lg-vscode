/**
 * GitHub Copilot Diagnostics Command
 * 
 * Команда для глубокой диагностики GitHub Copilot Chat и анализа доступных возможностей
 */

import * as vscode from "vscode";
import { AiProviderDetector } from "../services/ai/detector";
import { CopilotProvider, CopilotExtensionService } from "../services/ai";
import { logInfo } from "../logging/log";

export async function runCopilotDiagnostics(): Promise<void> {
  try {
    const report: any = {
      timestamp: new Date().toISOString(),
      copilotExtensions: {},
      copilotCommands: {},
      copilotConfig: {},
      copilotStatus: {},
      detection: {},
      commandTests: {},
      apiTests: {}
    };

    // 1. Детальный анализ Copilot расширений
    const extensions = vscode.extensions.all;
    const copilotExtensions = extensions.filter(ext => 
      ext.id.toLowerCase().includes('copilot') || 
      ext.id.toLowerCase().includes('github')
    );

    report.copilotExtensions = {
      totalExtensions: extensions.length,
      copilotRelated: copilotExtensions.map(ext => ({
        id: ext.id,
        isActive: ext.isActive,
        displayName: ext.packageJSON?.displayName,
        version: ext.packageJSON?.version,
        publisher: ext.packageJSON?.publisher,
        description: ext.packageJSON?.description,
        contributes: {
          commands: ext.packageJSON?.contributes?.commands?.length || 0,
          views: ext.packageJSON?.contributes?.views ? Object.keys(ext.packageJSON.contributes.views).length : 0,
          configuration: ext.packageJSON?.contributes?.configuration ? true : false
        }
      })),
      keyExtensions: {
        'github.copilot': extensions.find(ext => ext.id === 'github.copilot'),
        'github.copilot-chat': extensions.find(ext => ext.id === 'github.copilot-chat'),
        'github.copilot-nightly': extensions.find(ext => ext.id === 'github.copilot-nightly')
      }
    };

    // 2. Анализ Copilot команд
    const allCommands = await vscode.commands.getCommands();
    const copilotCommands = allCommands.filter(cmd => 
      cmd.toLowerCase().includes('copilot') || 
      cmd.toLowerCase().includes('github') ||
      cmd.toLowerCase().includes('chat')
    );

    report.copilotCommands = {
      totalCommands: allCommands.length,
      copilotRelated: copilotCommands.slice(0, 100), // ограничиваем вывод
      keyCommands: {
        // Команды отправки сообщений
        'github.copilot.chat.sendMessage': allCommands.includes('github.copilot.chat.sendMessage'),
        'github.copilot.chat.send': allCommands.includes('github.copilot.chat.send'),
        'github.copilot.sendMessage': allCommands.includes('github.copilot.sendMessage'),
        
        // Команды открытия/фокуса
        'github.copilot.chat.open': allCommands.includes('github.copilot.chat.open'),
        'github.copilot.chat.focus': allCommands.includes('github.copilot.chat.focus'),
        'github.copilot.openChat': allCommands.includes('github.copilot.openChat'),
        'workbench.panel.chat.view.copilot.focus': allCommands.includes('workbench.panel.chat.view.copilot.focus'),
        
        // Статус и управление
        'github.copilot.getStatus': allCommands.includes('github.copilot.getStatus'),
        'github.copilot.signIn': allCommands.includes('github.copilot.signIn'),
        'github.copilot.signOut': allCommands.includes('github.copilot.signOut'),
        
        // Альтернативные команды
        'workbench.action.chat.open': allCommands.includes('workbench.action.chat.open'),
        'workbench.action.chat.openInSidebar': allCommands.includes('workbench.action.chat.openInSidebar'),
        'workbench.panel.chat.view.copilot': allCommands.includes('workbench.panel.chat.view.copilot')
      }
    };

    // 3. Анализ конфигурации Copilot
    const config = vscode.workspace.getConfiguration();
    report.copilotConfig = {
      github: config.inspect('github'),
      copilot: config.inspect('copilot'),
      chat: config.inspect('chat'),
      // Специфичные настройки Copilot
      copilotSpecific: {
        'github.copilot.enable': config.get('github.copilot.enable'),
        'github.copilot.chat.enabled': config.get('github.copilot.chat.enabled'),
        'github.copilot.advanced': config.get('github.copilot.advanced'),
        'copilot.enable': config.get('copilot.enable'),
        'copilot.chat': config.get('copilot.chat')
      }
    };

    // 4. Проверка статуса Copilot
    try {
      const status = await vscode.commands.executeCommand('github.copilot.getStatus');
      report.copilotStatus = {
        status: status,
        statusType: typeof status,
        available: true
      };
    } catch (error: any) {
      report.copilotStatus = {
        error: error?.message || error,
        available: false
      };
    }

    // 5. Тестирование команд отправки сообщений
    const testMessage = "Test message from LG diagnostics";
    const sendCommands = [
      'github.copilot.chat.sendMessage',
      'github.copilot.chat.send',
      'github.copilot.sendMessage',
      'github.copilot.chat.insertIntoConversation',
      'github.copilot.chat.submitPrompt'
    ];

    for (const cmd of sendCommands) {
      if (allCommands.includes(cmd)) {
        try {
          const result = await vscode.commands.executeCommand(cmd, testMessage);
          report.commandTests[cmd] = {
            status: 'SUCCESS',
            result: typeof result,
            hasResult: result !== undefined
          };
        } catch (error: any) {
          report.commandTests[cmd] = {
            status: 'ERROR',
            error: error?.message || error
          };
        }
      } else {
        report.commandTests[cmd] = {
          status: 'NOT_FOUND'
        };
      }
    }

    // 6. Тестирование команд открытия/фокуса
    const focusCommands = [
      'github.copilot.chat.open',
      'github.copilot.chat.focus',
      'github.copilot.openChat',
      'workbench.panel.chat.view.copilot.focus',
      'workbench.action.chat.open',
      'workbench.action.chat.openInSidebar'
    ];

    for (const cmd of focusCommands) {
      if (allCommands.includes(cmd)) {
        try {
          await vscode.commands.executeCommand(cmd);
          report.commandTests[cmd] = 'SUCCESS';
        } catch (error: any) {
          report.commandTests[cmd] = `ERROR: ${error?.message || error}`;
        }
      } else {
        report.commandTests[cmd] = 'NOT_FOUND';
      }
    }

    // 7. Проверка API интеграции через расширения
    const copilotChatExt = vscode.extensions.getExtension('github.copilot-chat');
    const copilotExt = vscode.extensions.getExtension('github.copilot');

    report.apiTests = {
      copilotChatExtension: {
        found: !!copilotChatExt,
        isActive: copilotChatExt?.isActive,
        exports: copilotChatExt?.exports ? Object.keys(copilotChatExt.exports) : null,
        packageJSON: copilotChatExt?.packageJSON ? {
          contributes: copilotChatExt.packageJSON.contributes,
          activationEvents: copilotChatExt.packageJSON.activationEvents
        } : null
      },
      copilotExtension: {
        found: !!copilotExt,
        isActive: copilotExt?.isActive,
        exports: copilotExt?.exports ? Object.keys(copilotExt.exports) : null
      }
    };

    // 8. Тестирование детекции через наш код
    try {
      const detectionResult = await AiProviderDetector.detectProviders();
      const copilotAvailable = await AiProviderDetector.isProviderAvailable('copilot');
      
      report.detection = {
        detectionResult,
        copilotSpecific: copilotAvailable,
        detectorMethods: {
          hasCopilotExtension: await testHasCopilotExtension(),
          checkCopilotCommands: await testCheckCopilotCommands(),
          checkCopilotStatus: await testCheckCopilotStatus()
        }
      };
    } catch (error: any) {
      report.detection = {
        error: error?.message || error
      };
    }

    // 9. Тестирование улучшенной интеграции
    try {
      const copilotProvider = new CopilotProvider();
      const extensionService = new CopilotExtensionService();
      
      report.enhancedIntegration = {
        provider: {
          available: await copilotProvider.isAvailable(),
          diagnostics: copilotProvider.getCopilotDiagnostics()
        },
        extensionService: {
          available: extensionService.isAvailable(),
          diagnostics: extensionService.getDiagnostics(),
          availableTools: extensionService.getAvailableTools()
        }
      };
    } catch (error: any) {
      report.enhancedIntegration = {
        error: error?.message || error
      };
    }

    // Показываем отчет в новом документе
    const reportText = JSON.stringify(report, null, 2);
    
    const doc = await vscode.workspace.openTextDocument({
      language: 'json',
      content: reportText
    });
    
    await vscode.window.showTextDocument(doc, { preview: false });
    
    // Также логируем в Output
    logInfo('Copilot Diagnostics Report:', report);
    
    vscode.window.showInformationMessage('Copilot diagnostics completed. Check the opened document and Output panel.');
    
  } catch (error: any) {
    const message = `Copilot diagnostics failed: ${error?.message || error}`;
    vscode.window.showErrorMessage(message);
    logInfo(message);
  }
}

// Вспомогательные функции для тестирования методов детектора
async function testHasCopilotExtension(): Promise<boolean> {
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

async function testCheckCopilotCommands(): Promise<boolean> {
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

async function testCheckCopilotStatus(): Promise<boolean> {
  try {
    const status = await vscode.commands.executeCommand('github.copilot.getStatus');
    return status === 'SignedIn' || status === 'OK';
  } catch {
    return false;
  }
}

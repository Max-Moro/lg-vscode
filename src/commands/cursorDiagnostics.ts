/**
 * Cursor Diagnostics Command
 * 
 * Временная команда для диагностики и тестирования детекции Cursor AI
 */

import * as vscode from "vscode";
import { AiProviderDetector } from "../services/ai/detector";
import { logInfo } from "../logging/log";

export async function runCursorDiagnostics(): Promise<void> {
  try {
    const report: any = {
      timestamp: new Date().toISOString(),
      environment: {},
      commands: {},
      config: {},
      extensions: {},
      detection: {}
    };

    // 1. Environment detection
    report.environment = {
      appName: (vscode.env as any).appName,
      appRoot: (vscode.env as any).appRoot,
      version: vscode.version,
      uriScheme: vscode.env.uriScheme,
      language: vscode.env.language,
      machineId: vscode.env.machineId?.slice(0, 8) + "...", // только первые символы для безопасности
      sessionId: (vscode.env as any).sessionId,
      shell: (vscode.env as any).shell,
      // Проверяем process.env через Node.js context
      processEnv: {
        CURSOR_APP_NAME: process.env.CURSOR_APP_NAME,
        CURSOR_SESSION_ID: process.env.CURSOR_SESSION_ID,
        VSCODE_PID: process.env.VSCODE_PID,
        ELECTRON_RUN_AS_NODE: process.env.ELECTRON_RUN_AS_NODE
      }
    };

    // 2. Commands detection
    const allCommands = await vscode.commands.getCommands();
    const aiRelatedCommands = allCommands.filter(cmd => 
      cmd.toLowerCase().includes('cursor') || 
      cmd.toLowerCase().includes('ai') || 
      cmd.toLowerCase().includes('chat') ||
      cmd.toLowerCase().includes('copilot')
    );
    
    report.commands = {
      totalCommands: allCommands.length,
      aiRelatedCommands: aiRelatedCommands.slice(0, 50), // ограничиваем для читаемости
      keyCommands: {
        'cursor.openAIPane': allCommands.includes('cursor.openAIPane'),
        'cursor.showAIChat': allCommands.includes('cursor.showAIChat'),
        'cursor.ai.open': allCommands.includes('cursor.ai.open'),
        'workbench.action.chat.open': allCommands.includes('workbench.action.chat.open'),
        'workbench.panel.chat.view.copilot.focus': allCommands.includes('workbench.panel.chat.view.copilot.focus'),
        'inlineChat.showHint': allCommands.includes('inlineChat.showHint'),
        'inlineChat.hideHint': allCommands.includes('inlineChat.hideHint'),
        'github.copilot.chat.open': allCommands.includes('github.copilot.chat.open')
      }
    };

    // 3. Configuration inspection
    const config = vscode.workspace.getConfiguration();
    report.config = {
      cursor: config.inspect('cursor'),
      ai: config.inspect('ai'), 
      chat: config.inspect('chat'),
      copilot: config.inspect('copilot'),
      github: config.inspect('github')
    };

    // 4. Extensions inspection
    const extensions = vscode.extensions.all.map(ext => ({
      id: ext.id,
      isActive: ext.isActive,
      displayName: ext.packageJSON?.displayName,
      version: ext.packageJSON?.version
    }));
    
    const relevantExtensions = extensions.filter(ext => 
      ext.id.toLowerCase().includes('cursor') ||
      ext.id.toLowerCase().includes('ai') ||
      ext.id.toLowerCase().includes('copilot') ||
      ext.id.toLowerCase().includes('chat')
    );

    report.extensions = {
      totalExtensions: extensions.length,
      relevantExtensions,
      cursorBuiltins: extensions.filter(ext => ext.id.startsWith('cursor.')),
      cursorAnysphere: extensions.filter(ext => ext.id.startsWith('anysphere.')),
      copilotExtensions: extensions.filter(ext => ext.id.includes('copilot'))
    };

    // 5. Test command execution
    const commandTests: any = {};
    const testCommands = [
      'workbench.panel.chat.view.copilot.focus',
      'inlineChat.showHint',
      'inlineChat.hideHint',
      'workbench.action.quickOpen',
      'workbench.action.showCommands',
      'cursor.openAIPane',
      'cursor.showAIChat',
      'cursor.ai.open',
      'workbench.action.chat.open',
      'github.copilot.chat.open'
    ];

    for (const cmd of testCommands) {
      try {
        await vscode.commands.executeCommand(cmd);
        commandTests[cmd] = 'SUCCESS';
      } catch (error: any) {
        commandTests[cmd] = `ERROR: ${error?.message || error}`;
      }
    }
    report.commandTests = commandTests;

    // 6. Test AI Provider Detection
    try {
      const detectionResult = await AiProviderDetector.detectProviders();
      const cursorAvailable = await AiProviderDetector.isProviderAvailable('cursor');
      const copilotAvailable = await AiProviderDetector.isProviderAvailable('copilot');
      
      report.detection = {
        detectionResult,
        individualTests: {
          cursor: cursorAvailable,
          copilot: copilotAvailable
        }
      };
    } catch (error: any) {
      report.detection = {
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
    logInfo('Cursor Diagnostics Report:', report);
    
    vscode.window.showInformationMessage('Cursor diagnostics completed. Check the opened document and Output panel.');
    
  } catch (error: any) {
    const message = `Cursor diagnostics failed: ${error?.message || error}`;
    vscode.window.showErrorMessage(message);
    logInfo(message);
  }
}

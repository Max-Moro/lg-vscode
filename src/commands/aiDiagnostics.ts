/**
 * AI Diagnostics Command
 * 
 * Команда для диагностики доступных AI-провайдеров
 */

import * as vscode from "vscode";
import { AiIntegrationService } from "../services/ai";

export async function runAiDiagnostics(): Promise<void> {
  const aiService = new AiIntegrationService();
  
  try {
    // Обновляем детекцию провайдеров
    const detection = await aiService.refreshProviders();
    const providersInfo = await aiService.getProvidersInfo();
    const stats = aiService.getUsageStats();
    
    // Формируем отчет
    const report = [
      '# AI Providers Diagnostics',
      '',
      `**Detection Result:** ${detection.recommended} (${detection.reason})`,
      `**Available Providers:** ${detection.detected.join(', ') || 'None'}`,
      `**Total Providers:** ${stats.totalProviders}`,
      `**Last Detection:** ${stats.lastDetection?.toLocaleString() || 'Never'}`,
      '',
      '## Provider Details',
      ''
    ];
    
    for (const provider of providersInfo.available) {
      report.push(`### ${provider.info.name}`);
      report.push(`- **ID:** ${provider.id}`);
      report.push(`- **Available:** ${provider.info.available ? '✅' : '❌'}`);
      report.push(`- **Supports Auto Open:** ${provider.info.capabilities.supportsAutoOpen ? '✅' : '❌'}`);
      report.push(`- **Supports Direct Send:** ${provider.info.capabilities.supportsDirectSend ? '✅' : '❌'}`);
      report.push(`- **Preferred Method:** ${provider.info.capabilities.preferredMethod}`);
      if (provider.info.capabilities.recommendedMaxLength) {
        report.push(`- **Max Content Length:** ${provider.info.capabilities.recommendedMaxLength.toLocaleString()} chars`);
      }
      report.push('');
    }
    
    if (providersInfo.available.length === 0) {
      report.push('❌ **No AI providers detected**');
      report.push('');
      report.push('**Suggestions:**');
      report.push('- Make sure you\'re using Cursor or have GitHub Copilot Chat extension installed');
      report.push('- Check that the AI services are properly authenticated');
      report.push('- Try restarting VS Code if providers were recently installed');
    }
    
    // Показываем отчет в новом документе
    const doc = await vscode.workspace.openTextDocument({
      language: 'markdown',
      content: report.join('\n')
    });
    
    await vscode.window.showTextDocument(doc, { preview: false });
    
    // Также показываем краткую информацию в уведомлении
    const summary = detection.detected.length > 0
      ? `AI Providers: ${detection.detected.join(', ')} (recommended: ${detection.recommended})`
      : 'No AI providers detected';
      
    vscode.window.showInformationMessage(`LG: ${summary}`);
    
  } catch (error: any) {
    const message = `AI diagnostics failed: ${error?.message || error}`;
    vscode.window.showErrorMessage(message);
  }
}

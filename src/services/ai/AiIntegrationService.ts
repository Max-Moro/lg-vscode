/**
 * Universal AI Integration Service
 * 
 * Главный сервис для универсальной интеграции с различными AI-провайдерами
 */

import * as vscode from "vscode";
import { logInfo, logDebug, logWarn, logError } from "../../logging/log";
import { AiProviderDetector } from "./detector";
import { CursorAiProvider } from "./providers/CursorAiProvider";
import { CopilotProvider } from "./providers/CopilotProvider";
import type { 
  IAiProvider, 
  AiProvider, 
  AiContent, 
  AiProviderOptions,
  ContentType,
  ProviderDetectionResult 
} from "./types";

export class AiIntegrationService {
  private providers: Map<AiProvider, IAiProvider> = new Map();
  private detectionResult: ProviderDetectionResult | null = null;
  private lastDetectionTime: number = 0;
  private readonly DETECTION_CACHE_TTL = 30000; // 30 секунд
  
  constructor() {
    this.initProviders();
  }

  /**
   * Инициализация провайдеров
   */
  private initProviders(): void {
    this.providers.set('cursor', new CursorAiProvider());
    this.providers.set('copilot', new CopilotProvider());
    
    logDebug('[AiIntegration] Providers initialized:', Array.from(this.providers.keys()));
  }

  /**
   * Получение результата детекции (с кэшированием)
   */
  private async getDetection(): Promise<ProviderDetectionResult> {
    const now = Date.now();
    
    if (!this.detectionResult || (now - this.lastDetectionTime) > this.DETECTION_CACHE_TTL) {
      this.detectionResult = await AiProviderDetector.detectProviders();
      this.lastDetectionTime = now;
      logDebug('[AiIntegration] Detection refreshed:', this.detectionResult);
    }
    
    return this.detectionResult;
  }

  /**
   * Отправка контекста в AI
   */
  async sendContext(templateName: string, content: string, options?: AiProviderOptions): Promise<void> {
    const aiContent: AiContent = {
      content,
      type: 'context',
      metadata: {
        name: templateName,
        size: content.length,
        fileCount: this.estimateFileCount(content)
      }
    };

    await this.sendContent(aiContent, options);
    logInfo(`[AiIntegration] Context sent: ${templateName}, size: ${content.length}`);
  }

  /**
   * Отправка листинга в AI
   */
  async sendListing(sectionName: string, content: string, options?: AiProviderOptions): Promise<void> {
    const aiContent: AiContent = {
      content,
      type: 'listing',
      metadata: {
        name: sectionName,
        size: content.length,
        fileCount: this.estimateFileCount(content)
      }
    };

    await this.sendContent(aiContent, options);
    logInfo(`[AiIntegration] Listing sent: ${sectionName}, size: ${content.length}`);
  }

  /**
   * Отправка произвольного контента в AI
   */
  async sendGeneric(name: string, content: string, options?: AiProviderOptions): Promise<void> {
    const aiContent: AiContent = {
      content,
      type: 'generic',
      metadata: {
        name,
        size: content.length
      }
    };

    await this.sendContent(aiContent, options);
    logInfo(`[AiIntegration] Generic content sent: ${name}, size: ${content.length}`);
  }

  /**
   * Основной метод отправки контента
   */
  async sendContent(content: AiContent, options?: AiProviderOptions): Promise<void> {
    try {
      const provider = await this.selectProvider(options);
      
      // Показываем рекомендации если есть проблемы
      await this.showRecommendationsIfNeeded(provider, content);
      
      // Отправляем контент
      await provider.sendContent(content, options);
      
    } catch (error: any) {
      const message = `Failed to send content to AI: ${error?.message || error}`;
      logError(`[AiIntegration] ${message}`);
      vscode.window.showErrorMessage(message);
      throw error;
    }
  }

  /**
   * Выбор провайдера для отправки
   */
  private async selectProvider(options?: AiProviderOptions): Promise<IAiProvider> {
    const detection = await this.getDetection();
    
    // Если провайдер указан явно в опциях, используем его
    const explicitProvider = this.getExplicitProvider();
    if (explicitProvider && explicitProvider !== 'auto') {
      const provider = this.providers.get(explicitProvider);
      if (provider && await provider.isAvailable()) {
        logDebug(`[AiIntegration] Using explicit provider: ${explicitProvider}`);
        return provider;
      } else {
        logWarn(`[AiIntegration] Explicit provider ${explicitProvider} not available, falling back to auto-detection`);
      }
    }
    
    // Используем рекомендуемый провайдер из детекции
    const recommended = this.providers.get(detection.recommended);
    if (recommended && await recommended.isAvailable()) {
      logDebug(`[AiIntegration] Using recommended provider: ${detection.recommended} (${detection.reason})`);
      return recommended;
    }
    
    // Пытаемся найти любой доступный провайдер
    for (const providerId of detection.detected) {
      const provider = this.providers.get(providerId);
      if (provider && await provider.isAvailable()) {
        logDebug(`[AiIntegration] Using fallback provider: ${providerId}`);
        return provider;
      }
    }
    
    // Последний fallback - Cursor с предупреждением
    const cursorProvider = this.providers.get('cursor')!;
    logWarn('[AiIntegration] No AI providers detected, using Cursor as fallback (clipboard-based)');
    vscode.window.showWarningMessage(
      'No AI providers detected. Content will be copied to clipboard for manual pasting.',
      'OK'
    );
    
    return cursorProvider;
  }

  /**
   * Получение явно указанного провайдера из настроек
   */
  private getExplicitProvider(): AiProvider {
    const config = vscode.workspace.getConfiguration();
    return config.get<AiProvider>('lg.ai.provider', 'auto');
  }

  /**
   * Показ рекомендаций если есть проблемы с контентом
   */
  private async showRecommendationsIfNeeded(provider: IAiProvider, content: AiContent): Promise<void> {
    const recommendations = provider.getContentRecommendations(content);
    
    if (recommendations.warnings.length > 0) {
      const message = `AI Integration Warning:\n${recommendations.warnings.join('\n')}`;
      const suggestions = recommendations.suggestions.length > 0 
        ? `\n\nSuggestions:\n${recommendations.suggestions.join('\n')}`
        : '';
      
      const action = await vscode.window.showWarningMessage(
        message + suggestions,
        { modal: false },
        'Send Anyway',
        'Cancel'
      );
      
      if (action === 'Cancel') {
        throw new Error('User cancelled due to content warnings');
      }
    } else if (recommendations.suggestions.length > 0) {
      // Показываем только suggestions как информацию (не блокируем)
      const message = `AI Integration Tips:\n${recommendations.suggestions.join('\n')}`;
      vscode.window.showInformationMessage(message, 'OK');
    }
  }

  /**
   * Оценка количества файлов в контенте (эвристика)
   */
  private estimateFileCount(content: string): number {
    // Ищем маркеры файлов "# —— FILE: ... ——"
    const fileMarkers = content.match(/^#\s*——\s*FILE:/gm);
    if (fileMarkers) {
      return fileMarkers.length;
    }
    
    // Альтернативная эвристика: количество блоков кода
    const codeBlocks = content.match(/^```/gm);
    if (codeBlocks) {
      return Math.ceil(codeBlocks.length / 2); // Каждый файл = открытие + закрытие
    }
    
    return 1; // По умолчанию один файл
  }

  /**
   * Получение информации о доступных провайдерах
   */
  async getProvidersInfo(): Promise<{ available: IAiProvider[]; recommended: IAiProvider | null }> {
    const detection = await this.getDetection();
    const available: IAiProvider[] = [];
    
    for (const providerId of detection.detected) {
      const provider = this.providers.get(providerId);
      if (provider && await provider.isAvailable()) {
        available.push(provider);
      }
    }
    
    const recommended = this.providers.get(detection.recommended) || null;
    
    return { available, recommended };
  }

  /**
   * Принудительное обновление детекции провайдеров
   */
  async refreshProviders(): Promise<ProviderDetectionResult> {
    this.detectionResult = null;
    this.lastDetectionTime = 0;
    return this.getDetection();
  }

  /**
   * Проверка доступности конкретного провайдера
   */
  async isProviderAvailable(providerId: AiProvider): Promise<boolean> {
    const provider = this.providers.get(providerId);
    return provider ? provider.isAvailable() : false;
  }

  /**
   * Получение статистики использования
   */
  getUsageStats(): { totalProviders: number; detectedProviders: number; lastDetection: Date | null } {
    return {
      totalProviders: this.providers.size,
      detectedProviders: this.detectionResult?.detected.length || 0,
      lastDetection: this.lastDetectionTime ? new Date(this.lastDetectionTime) : null
    };
  }
}

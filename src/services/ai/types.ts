/**
 * Universal AI Integration Types
 * 
 * Типы для поддержки различных AI-провайдеров (Cursor AI, GitHub Copilot, и др.)
 */

export type AiProvider = 'cursor' | 'copilot' | 'auto';

export type ContentType = 'context' | 'listing' | 'generic';

export interface AiContent {
  /** Основной контент для отправки */
  content: string;
  /** Тип контента (для выбора подходящего префикса) */
  type: ContentType;
  /** Метаданные контента */
  metadata: {
    /** Имя шаблона/секции */
    name: string;
    /** Размер контента */
    size: number;
    /** Количество файлов (если применимо) */
    fileCount?: number;
  };
}

export interface AiProviderOptions {
  /** Добавлять ли описательный префикс */
  addPrefix?: boolean;
  /** Показывать ли детальные уведомления */
  showDetailedNotifications?: boolean;
  /** Автоматически открывать AI панель */
  autoOpenPanel?: boolean;
  /** Максимальная длина контента (для предупреждений) */
  maxContentLength?: number;
}

export interface AiProviderCapabilities {
  /** Поддерживает ли провайдер программное открытие панели */
  supportsAutoOpen: boolean;
  /** Поддерживает ли провайдер прямую отправку через API */
  supportsDirectSend: boolean;
  /** Предпочтительный способ отправки */
  preferredMethod: 'clipboard' | 'api' | 'command';
  /** Максимальная рекомендуемая длина контента */
  recommendedMaxLength?: number;
}

export interface AiProviderInfo {
  /** Название провайдера */
  name: string;
  /** Версия/расширение провайдера */
  version?: string;
  /** Доступность провайдера */
  available: boolean;
  /** Возможности провайдера */
  capabilities: AiProviderCapabilities;
}

/**
 * Интерфейс для провайдера AI-интеграции
 */
export interface IAiProvider {
  /** Идентификатор провайдера */
  readonly id: AiProvider;
  
  /** Информация о провайдере */
  readonly info: AiProviderInfo;

  /**
   * Проверить доступность провайдера
   */
  isAvailable(): Promise<boolean>;

  /**
   * Отправить контент в AI
   */
  sendContent(content: AiContent, options?: AiProviderOptions): Promise<void>;

  /**
   * Получить рекомендации по оптимизации контента для данного провайдера
   */
  getContentRecommendations(content: AiContent): {
    warnings: string[];
    suggestions: string[];
  };
}

/**
 * Результат детекции провайдера
 */
export interface ProviderDetectionResult {
  /** Найденные провайдеры в порядке приоритета */
  detected: AiProvider[];
  /** Рекомендуемый провайдер */
  recommended: AiProvider;
  /** Причина выбора рекомендуемого провайдера */
  reason: string;
}

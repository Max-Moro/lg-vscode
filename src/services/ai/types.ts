/**
 * Базовые типы для AI Integration системы
 */

/**
 * Информация о детекторе провайдера
 */
export interface ProviderDetector {
  /** Приоритет провайдера (0-100, выше = предпочтительнее) */
  priority: number;

  /**
   * Проверка доступности провайдера
   * Вызывается один раз при активации расширения
   */
  detect(): Promise<boolean>;
}

/**
 * Интерфейс провайдера AI
 */
export interface AiProvider {
  /** Уникальный идентификатор провайдера */
  readonly id: string;

  /** Человекочитаемое имя провайдера */
  readonly name: string;

  /**
   * Отправить контент в AI
   * @throws Error при ошибке отправки
   */
  send(content: string): Promise<void>;
}

/**
 * Полная информация о провайдере с детектором
 */
export interface ProviderModule {
  provider: AiProvider;
  detector: ProviderDetector;
}
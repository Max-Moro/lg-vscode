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

import type { AiInteractionMode } from "../../models/AiInteractionMode";

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
   * @param content - Контент для отправки
   * @param mode - Режим AI-взаимодействия (ask/agent)
   * @throws Error при ошибке отправки
   */
  send(content: string, mode: AiInteractionMode): Promise<void>;
}

/**
 * Полная информация о провайдере с детектором
 */
export interface ProviderModule {
  provider: AiProvider;
  detector: ProviderDetector;
}
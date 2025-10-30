import type { AiProvider } from "../types";
import type { AiInteractionMode } from "../../../models/AiInteractionMode";

/**
 * Базовый абстрактный класс для всех AI провайдеров
 * 
 * Определяет минимальный интерфейс, который должен реализовать любой провайдер.
 * Все специализированные базовые классы наследуются от этого класса.
 */
export abstract class BaseAiProvider implements AiProvider {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract send(content: string, mode: AiInteractionMode): Promise<void>;
}

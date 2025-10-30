/**
 * Типизированный режим AI-взаимодействия.
 * 
 * Соответствует набору режимов `ai-interaction` из lg-cfg/modes.yaml:
 * - ask: Базовый режим вопрос-ответ
 * - agent: Режим с инструментами и агентными возможностями
 * 
 * Используется для унификации поведения AI-провайдеров.
 */
export enum AiInteractionMode {
  ASK = "ask",
  AGENT = "agent"
}

/**
 * Парсинг режима из строки
 */
export function parseAiInteractionMode(value: string | undefined): AiInteractionMode {
  switch (value) {
    case "ask":
      return AiInteractionMode.ASK;
    case "agent":
      return AiInteractionMode.AGENT;
    default:
      return AiInteractionMode.AGENT;
  }
}


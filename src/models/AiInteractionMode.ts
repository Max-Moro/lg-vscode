/**
 * Typed AI interaction mode.
 *
 * Corresponds to the set of `ai-interaction` modes from lg-cfg/modes.yaml:
 * - ask: Basic question-answer mode
 * - agent: Mode with tools and agent capabilities
 *
 * Used for unifying behavior of AI providers.
 */
export enum AiInteractionMode {
  ASK = "ask",
  AGENT = "agent"
}

/**
 * Parsing mode from string
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


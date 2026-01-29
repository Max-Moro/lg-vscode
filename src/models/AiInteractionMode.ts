/**
 * Typed AI interaction mode.
 *
 * Corresponds to the set of `ai-interaction` modes from lg-cfg/modes.yaml:
 * - ask: Basic question-answer mode
 * - agent: Mode with tools and agent capabilities
 *
 * Used for unifying behavior of AI providers.
 *
 * @deprecated This enum will be removed in the next version.
 * AI providers should use `runs` string from mode configuration instead.
 * See: ModeSet.modes[].runs in mode_sets_list.ts
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


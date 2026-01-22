/**
 * Codex reasoning effort levels.
 * Controls how much "thinking" the model does before responding.
 */
export type CodexReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";

/**
 * Description of reasoning effort level for UI
 */
export interface CodexReasoningEffortDescriptor {
  id: CodexReasoningEffort;
  label: string;
  description: string;
}

/**
 * Get default reasoning effort
 */
export function getDefaultCodexReasoningEffort(): CodexReasoningEffort {
  return "medium";
}

/**
 * Get list of available reasoning effort levels
 */
export function getAvailableCodexReasoningEfforts(): CodexReasoningEffortDescriptor[] {
  return [
    { id: "minimal", label: "Minimal", description: "Fastest, least thorough" },
    { id: "low", label: "Low", description: "Quick tasks" },
    { id: "medium", label: "Medium", description: "Balanced (default)" },
    { id: "high", label: "High", description: "Complex tasks" },
    { id: "xhigh", label: "Extra High", description: "Most thorough, slowest" }
  ];
}

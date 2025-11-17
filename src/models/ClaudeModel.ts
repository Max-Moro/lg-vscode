/**
 * Claude model families
 */
export type ClaudeModel = "haiku" | "sonnet" | "opus";

/**
 * Description of Claude model for UI
 */
export interface ClaudeModelDescriptor {
  id: ClaudeModel;
  label: string;
  description?: string;
}

/**
 * Get default Claude model
 */
export function getDefaultClaudeModel(): ClaudeModel {
  return "sonnet";
}

/**
 * Get list of available Claude models
 */
export function getAvailableClaudeModels(): ClaudeModelDescriptor[] {
  return [
    { id: "haiku", label: "Haiku", description: "Fast and cost-effective" },
    { id: "sonnet", label: "Sonnet", description: "Balanced performance" },
    { id: "opus", label: "Opus", description: "Most powerful" }
  ];
}


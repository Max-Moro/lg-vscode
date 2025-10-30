/**
 * Claude model families
 */
export type ClaudeModel = "haiku" | "sonnet" | "opus";

/**
 * Описание модели Claude для UI
 */
export interface ClaudeModelDescriptor {
  id: ClaudeModel;
  label: string;
  description?: string;
}

/**
 * Получить дефолтную модель Claude
 */
export function getDefaultClaudeModel(): ClaudeModel {
  return "sonnet";
}

/**
 * Получить список доступных моделей Claude
 */
export function getAvailableClaudeModels(): ClaudeModelDescriptor[] {
  return [
    { id: "haiku", label: "Haiku", description: "Fast and cost-effective" },
    { id: "sonnet", label: "Sonnet", description: "Balanced performance" },
    { id: "opus", label: "Opus", description: "Most powerful" }
  ];
}


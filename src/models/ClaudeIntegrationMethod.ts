/**
 * Методы интеграции с Claude Code
 */
export type ClaudeIntegrationMethod = "memory-file" | "session";

/**
 * Описание метода интеграции для UI
 */
export interface ClaudeMethodDescriptor {
  id: ClaudeIntegrationMethod;
  label: string;
  description: string;
}

/**
 * Получить дефолтный метод интеграции
 */
export function getDefaultClaudeMethod(): ClaudeIntegrationMethod {
  return "session";
}

/**
 * Получить список доступных методов интеграции
 */
export function getAvailableClaudeMethods(): ClaudeMethodDescriptor[] {
  return [
    {
      id: "memory-file",
      label: "Memory File",
      description: "Stable method using CLAUDE.local.md (visible to all subagents)"
    },
    {
      id: "session",
      label: "Session",
      description: "Better isolation - content visible only to orchestrator, not subagents"
    }
  ];
}

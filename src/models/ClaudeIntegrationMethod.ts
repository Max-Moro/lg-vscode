/**
 * Integration methods with Claude Code
 */
export type ClaudeIntegrationMethod = "memory-file" | "session";

/**
 * Description of integration method for UI
 */
export interface ClaudeMethodDescriptor {
  id: ClaudeIntegrationMethod;
  label: string;
  description: string;
}

/**
 * Get default integration method
 */
export function getDefaultClaudeMethod(): ClaudeIntegrationMethod {
  return "session";
}

/**
 * Get list of available integration methods
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

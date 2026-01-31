/**
 * Business rules for CLI provider settings
 */

import type { TypedRule } from "../types";

/**
 * Rule: When CLI scope is set, update persistent state
 */
export const cliScopeSet: TypedRule<"SET_CLI_SCOPE"> = {
  id: "cli-scope-set",
  description: "When CLI scope is set, update persistent state",
  trigger: "SET_CLI_SCOPE",
  condition: () => true,
  apply: (_state, cmd) => ({
    mutations: { cliScope: cmd.scope }
  })
};

/**
 * Rule: When CLI shell is selected, update persistent state
 */
export const cliShellSelect: TypedRule<"SELECT_CLI_SHELL"> = {
  id: "cli-shell-select",
  description: "When CLI shell is selected, update persistent state",
  trigger: "SELECT_CLI_SHELL",
  condition: () => true,
  apply: (_state, cmd) => ({
    mutations: { cliShell: cmd.shell }
  })
};

/**
 * Rule: When Claude model is selected, update persistent state
 */
export const claudeModelSelect: TypedRule<"SELECT_CLAUDE_MODEL"> = {
  id: "claude-model-select",
  description: "When Claude model is selected, update persistent state",
  trigger: "SELECT_CLAUDE_MODEL",
  condition: () => true,
  apply: (_state, cmd) => ({
    mutations: { claudeModel: cmd.model }
  })
};

/**
 * Rule: When Claude integration method is selected, update persistent state
 */
export const claudeMethodSelect: TypedRule<"SELECT_CLAUDE_METHOD"> = {
  id: "claude-method-select",
  description: "When Claude integration method is selected, update persistent state",
  trigger: "SELECT_CLAUDE_METHOD",
  condition: () => true,
  apply: (_state, cmd) => ({
    mutations: { claudeIntegrationMethod: cmd.method }
  })
};

/**
 * Rule: When Codex reasoning effort is selected, update persistent state
 */
export const codexReasoningSelect: TypedRule<"SELECT_CODEX_REASONING"> = {
  id: "codex-reasoning-select",
  description: "When Codex reasoning effort is selected, update persistent state",
  trigger: "SELECT_CODEX_REASONING",
  condition: () => true,
  apply: (_state, cmd) => ({
    mutations: { codexReasoningEffort: cmd.effort }
  })
};

/**
 * Rule: When task text is set, update persistent state
 */
export const taskTextSet: TypedRule<"SET_TASK_TEXT"> = {
  id: "task-text-set",
  description: "When task text is set, update persistent state",
  trigger: "SET_TASK_TEXT",
  condition: () => true,
  apply: (_state, cmd) => ({
    mutations: { taskText: cmd.text }
  })
};

export const cliSettingsRules = [
  cliScopeSet,
  cliShellSelect,
  claudeModelSelect,
  claudeMethodSelect,
  codexReasoningSelect,
  taskTextSet
];

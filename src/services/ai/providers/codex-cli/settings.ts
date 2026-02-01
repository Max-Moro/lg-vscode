/**
 * Codex CLI Provider Settings Module
 *
 * Commands:
 * - provider.codex-cli/SELECT_REASONING
 */

import type { BusinessRule, BaseCommand, PCEState } from "../../../../state/types";
import type { ProviderSettingsModule } from "../../types";
import { getAvailableCodexReasoningEfforts, getDefaultCodexReasoningEffort, type CodexReasoningEffort } from "../../../../models/CodexReasoningEffort";

// ============================================
// Commands
// ============================================

export interface SelectCodexReasoningCmd extends BaseCommand {
  type: "provider.codex-cli/SELECT_REASONING";
  effort: CodexReasoningEffort;
}

export type CodexCliCommand = SelectCodexReasoningCmd;

// ============================================
// State Helpers
// ============================================

function getCodexSettings(state: PCEState): { reasoning: CodexReasoningEffort } {
  const settings = state.persistent.providerSettings["codex-cli"] || {};
  return {
    reasoning: (settings.reasoning as CodexReasoningEffort) || getDefaultCodexReasoningEffort()
  };
}

function updateCodexSettings(
  state: PCEState,
  updates: Partial<{ reasoning: CodexReasoningEffort }>
): PCEState["persistent"]["providerSettings"] {
  return {
    ...state.persistent.providerSettings,
    "codex-cli": {
      ...state.persistent.providerSettings["codex-cli"],
      ...updates
    }
  };
}

// ============================================
// Rules
// ============================================

const selectReasoning: BusinessRule = {
  id: "provider.codex-cli/select-reasoning",
  description: "When Codex reasoning effort is selected, update provider settings",
  trigger: "provider.codex-cli/SELECT_REASONING",
  condition: () => true,
  apply: (state: PCEState, cmd: BaseCommand) => ({
    mutations: {
      providerSettings: updateCodexSettings(state, {
        reasoning: (cmd as SelectCodexReasoningCmd).effort
      })
    }
  })
};

// ============================================
// Settings Module Export
// ============================================

export const codexCliSettings: ProviderSettingsModule = {
  providerId: "com.openai.codex.cli",

  rules: [selectReasoning],

  stateDefaults: {
    reasoning: getDefaultCodexReasoningEffort()
  },

  isVisible: (state: PCEState) => state.persistent.providerId === "com.openai.codex.cli",

  buildViewModel: (state: PCEState): Record<string, unknown> => {
    const { reasoning } = getCodexSettings(state);

    return {
      codexSettingsVisible: state.persistent.providerId === "com.openai.codex.cli",
      codexReasoningEfforts: getAvailableCodexReasoningEfforts().map(r => ({
        value: r.id,
        label: r.label,
        description: r.description
      })),
      selectedCodexReasoning: reasoning
    };
  }
};

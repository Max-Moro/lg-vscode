/**
 * Codex CLI Provider Settings Module
 */

import { command } from "../../../state-engine";
import { rule } from "../../../state-lg/rule";
import type { PCEState } from "../../../state-lg";
import type { ProviderSettingsModule } from "../../types";
import type { ProviderSettingsContribution } from "../../../viewmodel/types";
import type { CommandOf } from "../../../state-engine/types";
import { getAvailableCodexReasoningEfforts, getDefaultCodexReasoningEffort, type CodexReasoningEffort } from "./CodexReasoningEffort";

// ============================================
// Commands
// ============================================

export const SelectCodexReasoning = command("provider.codex-cli/SELECT_REASONING").payload<{ effort: CodexReasoningEffort }>();

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

/** When Codex reasoning effort is selected, update provider settings */
rule(SelectCodexReasoning, {
  condition: () => true,
  apply: (state: PCEState, cmd: CommandOf<typeof SelectCodexReasoning>) => ({
    mutations: {
      providerSettings: updateCodexSettings(state, {
        reasoning: cmd.effort
      })
    }
  })
});

// ============================================
// Settings Module Export
// ============================================

export const codexCliSettings: ProviderSettingsModule = {
  providerId: "com.openai.codex.cli",

  stateDefaults: {
    reasoning: getDefaultCodexReasoningEffort()
  },

  buildContribution: (state: PCEState): ProviderSettingsContribution => {
    const isVisible = state.persistent.providerId === "com.openai.codex.cli";
    const { reasoning } = getCodexSettings(state);

    return {
      providerId: "com.openai.codex.cli",
      title: "Codex Settings",
      visible: isVisible,
      fields: [
        {
          id: "codexReasoningEffort",
          type: "select",
          label: "Reasoning",
          options: getAvailableCodexReasoningEfforts().map(r => ({
            value: r.id,
            label: r.label,
            description: r.description
          })),
          value: reasoning,
          command: {
            type: "provider.codex-cli/SELECT_REASONING",
            payloadKey: "effort"
          }
        }
      ]
    };
  }
};

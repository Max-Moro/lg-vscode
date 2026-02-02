/**
 * Claude CLI Provider Settings Module
 */

import { command, rule, type PCEState } from "../../../../state/types";
import type { ProviderSettingsModule } from "../../types";
import type { ProviderSettingsContribution } from "../../../../viewmodel/types";
import { getAvailableClaudeModels, getDefaultClaudeModel, type ClaudeModel } from "../../../../models/ClaudeModel";
import { getAvailableClaudeMethods, getDefaultClaudeMethod, type ClaudeIntegrationMethod } from "../../../../models/ClaudeIntegrationMethod";

// ============================================
// Commands
// ============================================

export const SelectClaudeModel = command("provider.claude-cli/SELECT_MODEL").payload<{ model: ClaudeModel }>();
export const SelectClaudeMethod = command("provider.claude-cli/SELECT_METHOD").payload<{ method: ClaudeIntegrationMethod }>();

// ============================================
// State Helpers
// ============================================

function getClaudeSettings(state: PCEState): { model: ClaudeModel; method: ClaudeIntegrationMethod } {
  const settings = state.persistent.providerSettings["claude-cli"] || {};
  return {
    model: (settings.model as ClaudeModel) || getDefaultClaudeModel(),
    method: (settings.method as ClaudeIntegrationMethod) || getDefaultClaudeMethod()
  };
}

function updateClaudeSettings(
  state: PCEState,
  updates: Partial<{ model: ClaudeModel; method: ClaudeIntegrationMethod }>
): PCEState["persistent"]["providerSettings"] {
  return {
    ...state.persistent.providerSettings,
    "claude-cli": {
      ...state.persistent.providerSettings["claude-cli"],
      ...updates
    }
  };
}

// ============================================
// Rules
// ============================================

/** When Claude model is selected, update provider settings */
rule(SelectClaudeModel, {
  condition: () => true,
  apply: (state: PCEState, cmd) => ({
    mutations: {
      providerSettings: updateClaudeSettings(state, {
        model: cmd.model
      })
    }
  })
});

/** When Claude integration method is selected, update provider settings */
rule(SelectClaudeMethod, {
  condition: () => true,
  apply: (state: PCEState, cmd) => ({
    mutations: {
      providerSettings: updateClaudeSettings(state, {
        method: cmd.method
      })
    }
  })
});

// ============================================
// Settings Module Export
// ============================================

export const claudeCliSettings: ProviderSettingsModule = {
  providerId: "com.anthropic.claude.cli",

  stateDefaults: {
    model: getDefaultClaudeModel(),
    method: getDefaultClaudeMethod()
  },

  buildContribution: (state: PCEState): ProviderSettingsContribution => {
    const isVisible = state.persistent.providerId === "com.anthropic.claude.cli";
    const { model, method } = getClaudeSettings(state);

    return {
      providerId: "com.anthropic.claude.cli",
      title: "Claude Settings",
      visible: isVisible,
      fields: [
        {
          id: "claudeModel",
          type: "select",
          label: "Model",
          options: getAvailableClaudeModels().map(m => ({
            value: m.id,
            label: m.label,
            description: m.description
          })),
          value: model,
          command: {
            type: "provider.claude-cli/SELECT_MODEL",
            payloadKey: "model"
          }
        },
        {
          id: "claudeIntegrationMethod",
          type: "select",
          label: "Method",
          options: getAvailableClaudeMethods().map(m => ({
            value: m.id,
            label: m.label,
            description: m.description
          })),
          value: method,
          command: {
            type: "provider.claude-cli/SELECT_METHOD",
            payloadKey: "method"
          }
        }
      ]
    };
  }
};

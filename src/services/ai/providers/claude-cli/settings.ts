/**
 * Claude CLI Provider Settings Module
 */

import type { BusinessRule, BaseCommand, PCEState } from "../../../../state/types";
import type { ProviderSettingsModule } from "../../types";
import type { ProviderSettingsContribution } from "../../../../viewmodel/types";
import { getAvailableClaudeModels, getDefaultClaudeModel, type ClaudeModel } from "../../../../models/ClaudeModel";
import { getAvailableClaudeMethods, getDefaultClaudeMethod, type ClaudeIntegrationMethod } from "../../../../models/ClaudeIntegrationMethod";

// ============================================
// Commands
// ============================================

export interface SelectClaudeModelCmd extends BaseCommand {
  type: "provider.claude-cli/SELECT_MODEL";
  model: ClaudeModel;
}

export interface SelectClaudeMethodCmd extends BaseCommand {
  type: "provider.claude-cli/SELECT_METHOD";
  method: ClaudeIntegrationMethod;
}

export type ClaudeCliCommand = SelectClaudeModelCmd | SelectClaudeMethodCmd;

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

const selectModel: BusinessRule = {
  id: "provider.claude-cli/select-model",
  description: "When Claude model is selected, update provider settings",
  trigger: "provider.claude-cli/SELECT_MODEL",
  condition: () => true,
  apply: (state: PCEState, cmd: BaseCommand) => ({
    mutations: {
      providerSettings: updateClaudeSettings(state, {
        model: (cmd as SelectClaudeModelCmd).model
      })
    }
  })
};

const selectMethod: BusinessRule = {
  id: "provider.claude-cli/select-method",
  description: "When Claude integration method is selected, update provider settings",
  trigger: "provider.claude-cli/SELECT_METHOD",
  condition: () => true,
  apply: (state: PCEState, cmd: BaseCommand) => ({
    mutations: {
      providerSettings: updateClaudeSettings(state, {
        method: (cmd as SelectClaudeMethodCmd).method
      })
    }
  })
};

// ============================================
// Settings Module Export
// ============================================

export const claudeCliSettings: ProviderSettingsModule = {
  providerId: "com.anthropic.claude.cli",

  rules: [selectModel, selectMethod],

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

/**
 * Business rules for provider selection
 */

import type { TypedRule, ProviderInfo } from "../types";
import { cliListContexts } from "../../cli/CliClient";

/**
 * Rule: When provider changes, reload contexts filtered by new provider
 */
export const providerChangeContexts: TypedRule<"SELECT_PROVIDER"> = {
  id: "provider-change-contexts",
  description: "When provider changes, reload contexts filtered by new provider",
  trigger: "SELECT_PROVIDER",
  condition: (state, cmd) => cmd.providerId !== state.persistent.providerId,
  apply: (_state, cmd) => ({
    mutations: { providerId: cmd.providerId },
    asyncOps: [{
      id: "load-contexts",
      execute: async () => {
        const contexts = await cliListContexts(cmd.providerId);
        return { type: "CONTEXTS_LOADED", contexts };
      }
    }]
  })
};

/**
 * Rule: When providers detected, select saved or best available
 */
export const providersSelectInitial: TypedRule<"PROVIDERS_DETECTED"> = {
  id: "providers-select-initial",
  description: "When providers detected, select saved or best available",
  trigger: "PROVIDERS_DETECTED",
  condition: () => true,
  apply: (state, cmd) => {
    const savedProvider = state.persistent.providerId;
    const providers = cmd.providers;

    // Check if saved provider is still available
    const savedExists = providers.some((p: ProviderInfo) => p.id === savedProvider);
    const effectiveProvider = savedExists
      ? savedProvider
      : (providers[0]?.id || "clipboard");

    return {
      configMutations: {
        // Note: providers are stored in environment, handled by lifecycle rules
      },
      followUp: [{ type: "SELECT_PROVIDER", providerId: effectiveProvider }]
    };
  }
};

export const providerRules = [
  providerChangeContexts,
  providersSelectInitial
];

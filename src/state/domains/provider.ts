/**
 * Provider Domain - provider selection and common CLI settings
 */

import { command, rule, type PCEState, type ProviderInfo, type BaseCommand } from "../types";
import type { ShellType } from "../../models/ShellType";
import { cliListContexts, cliListModeSets } from "../../cli/CliClient";

// ============================================
// Commands
// ============================================

export const SelectProvider = command("provider/SELECT").payload<{ providerId: string }>();
export const ProvidersDetected = command("provider/DETECTED").payload<{ providers: ProviderInfo[] }>();
export const SetCliScope = command("provider/SET_CLI_SCOPE").payload<{ scope: string }>();
export const SelectCliShell = command("provider/SELECT_CLI_SHELL").payload<{ shell: ShellType }>();

// ============================================
// Rules
// ============================================

/** When providers detected, store in environment and select best available */
rule(ProvidersDetected, {
  condition: () => true,
  apply: (state: PCEState, cmd) => {
    const { providers } = cmd;
    const savedProvider = state.persistent.providerId;

    const savedExists = providers.some((p: ProviderInfo) => p.id === savedProvider);
    const effectiveProvider = savedExists
      ? savedProvider
      : (providers[0]?.id || "clipboard");

    return {
      envMutations: { providers },
      followUp: [SelectProvider.create({ providerId: effectiveProvider })]
    };
  }
});

/** When provider changes, reload contexts and mode-sets */
rule(SelectProvider, {
  condition: (state: PCEState, cmd) =>
    cmd.providerId !== state.persistent.providerId,
  apply: (state: PCEState, cmd) => {
    const { providerId } = cmd;
    const template = state.persistent.template;

    const asyncOps: Array<{ execute: () => Promise<BaseCommand> }> = [
      {
        execute: async () => {
          const contexts = await cliListContexts(providerId);
          return { type: "context/LOADED", contexts } as BaseCommand;
        }
      }
    ];

    // Mode-sets depend on both provider AND template
    // Reload them if template exists (tags don't depend on provider, so skip them)
    if (template) {
      asyncOps.push({
        execute: async () => {
          const modeSets = await cliListModeSets(template, providerId);
          return { type: "adaptive/MODE_SETS_LOADED", modeSets } as BaseCommand;
        }
      });
    }

    return {
      mutations: { providerId },
      asyncOps
    };
  }
});

/** When CLI scope is set, update persistent state */
rule(SetCliScope, {
  condition: () => true,
  apply: (_state: PCEState, cmd) => ({
    mutations: { cliScope: cmd.scope }
  })
});

/** When CLI shell is selected, update persistent state */
rule(SelectCliShell, {
  condition: () => true,
  apply: (_state: PCEState, cmd) => ({
    mutations: { cliShell: cmd.shell }
  })
});

/**
 * Provider Domain - provider selection and common CLI settings
 *
 * Commands:
 * - provider/SELECT - select AI provider
 * - provider/DETECTED - providers detected at startup
 * - provider/SET_CLI_SCOPE - set CLI scope path
 * - provider/SELECT_CLI_SHELL - select CLI shell type
 */

import type { BusinessRule, DomainModule, BaseCommand, PCEState, ProviderInfo } from "../types";
import type { ShellType } from "../../models/ShellType";
import { cliListContexts } from "../../cli/CliClient";

// ============================================
// Commands
// ============================================

export interface SelectProviderCmd extends BaseCommand {
  type: "provider/SELECT";
  providerId: string;
}

export interface ProvidersDetectedCmd extends BaseCommand {
  type: "provider/DETECTED";
  providers: ProviderInfo[];
}

export interface SetCliScopeCmd extends BaseCommand {
  type: "provider/SET_CLI_SCOPE";
  scope: string;
}

export interface SelectCliShellCmd extends BaseCommand {
  type: "provider/SELECT_CLI_SHELL";
  shell: ShellType;
}

export type ProviderCommand =
  | SelectProviderCmd
  | ProvidersDetectedCmd
  | SetCliScopeCmd
  | SelectCliShellCmd;

// ============================================
// Rules
// ============================================

const providersDetected: BusinessRule = {
  id: "provider/detected",
  description: "When providers detected, store in environment and select best available",
  trigger: "provider/DETECTED",
  condition: () => true,
  apply: (state: PCEState, cmd: BaseCommand) => {
    const { providers } = cmd as ProvidersDetectedCmd;
    const savedProvider = state.persistent.providerId;

    const savedExists = providers.some((p: ProviderInfo) => p.id === savedProvider);
    const effectiveProvider = savedExists
      ? savedProvider
      : (providers[0]?.id || "clipboard");

    return {
      envMutations: { providers },
      followUp: [{ type: "provider/SELECT", providerId: effectiveProvider }]
    };
  }
};

const providerSelect: BusinessRule = {
  id: "provider/select",
  description: "When provider changes, reload contexts filtered by new provider",
  trigger: "provider/SELECT",
  condition: (state: PCEState, cmd: BaseCommand) =>
    (cmd as SelectProviderCmd).providerId !== state.persistent.providerId,
  apply: (_state: PCEState, cmd: BaseCommand) => {
    const { providerId } = cmd as SelectProviderCmd;
    return {
      mutations: { providerId },
      asyncOps: [{
        id: "load-contexts",
        execute: async () => {
          const contexts = await cliListContexts(providerId);
          return { type: "context/LOADED", contexts };
        }
      }]
    };
  }
};

const cliScopeSet: BusinessRule = {
  id: "provider/set-cli-scope",
  description: "When CLI scope is set, update persistent state",
  trigger: "provider/SET_CLI_SCOPE",
  condition: () => true,
  apply: (_state: PCEState, cmd: BaseCommand) => ({
    mutations: { cliScope: (cmd as SetCliScopeCmd).scope }
  })
};

const cliShellSelect: BusinessRule = {
  id: "provider/select-cli-shell",
  description: "When CLI shell is selected, update persistent state",
  trigger: "provider/SELECT_CLI_SHELL",
  condition: () => true,
  apply: (_state: PCEState, cmd: BaseCommand) => ({
    mutations: { cliShell: (cmd as SelectCliShellCmd).shell }
  })
};

// ============================================
// Domain Module Export
// ============================================

export const providerDomain: DomainModule = {
  id: "provider",
  rules: [providersDetected, providerSelect, cliScopeSet, cliShellSelect]
};

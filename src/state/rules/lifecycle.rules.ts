/**
 * Business rules for lifecycle events (initialize, refresh)
 */

import type { TypedRule, EnvironmentState } from "../types";
import { cliListSections } from "../../cli/CliClient";
import { listTokenizerLibsJson } from "../../services/CatalogService";
import { getAvailableShells } from "../../models/ShellType";
import { getAvailableClaudeModels } from "../../models/ClaudeModel";
import { getAvailableClaudeMethods } from "../../models/ClaudeIntegrationMethod";
import { getAvailableCodexReasoningEfforts } from "../../models/CodexReasoningEffort";

// These will be injected during coordinator setup
let detectProviders: () => Promise<Array<{ id: string; name: string; priority: number }>>;
let getBranchNames: () => Promise<string[]>;

/**
 * Set external dependencies for lifecycle rules
 */
export function setLifecycleDependencies(deps: {
  detectProviders: () => Promise<Array<{ id: string; name: string; priority: number }>>;
  getBranchNames: () => Promise<string[]>;
}): void {
  detectProviders = deps.detectProviders;
  getBranchNames = deps.getBranchNames;
}

/**
 * Rule: On initialize, detect providers and load all catalogs
 */
export const initializeBootstrap: TypedRule<"INITIALIZE"> = {
  id: "initialize-bootstrap",
  description: "On initialize, detect providers and load all catalogs",
  trigger: "INITIALIZE",
  condition: () => true,
  apply: (_state) => {
    // Build environment state from platform detection
    const _environment: EnvironmentState = {
      providers: [], // Will be populated by PROVIDERS_DETECTED
      cliShells: getAvailableShells(),
      claudeModels: getAvailableClaudeModels(),
      claudeIntegrationMethods: getAvailableClaudeMethods(),
      codexReasoningEfforts: getAvailableCodexReasoningEfforts()
    };

    return {
      configMutations: {
        // Reset configuration to empty while loading
        contexts: [],
        sections: [],
        modeSets: { "mode-sets": [] },
        tagSets: { "tag-sets": [] },
        branches: []
      },
      asyncOps: [
        {
          id: "detect-providers",
          execute: async () => {
            const providers = await detectProviders();
            return { type: "PROVIDERS_DETECTED", providers };
          }
        },
        {
          id: "load-tokenizer-libs",
          execute: async () => {
            const libs = await listTokenizerLibsJson();
            return { type: "TOKENIZER_LIBS_LOADED", libs };
          }
        },
        {
          id: "load-sections",
          execute: async () => {
            const sections = await cliListSections();
            return { type: "SECTIONS_LOADED", sections };
          }
        },
        {
          id: "load-branches",
          execute: async () => {
            const branches = await getBranchNames();
            return { type: "BRANCHES_LOADED", branches };
          }
        }
      ]
    };
  }
};

/**
 * Rule: On refresh, reload all catalogs with current selections
 */
export const refreshCatalogs: TypedRule<"REFRESH"> = {
  id: "refresh-catalogs",
  description: "On refresh, reload all catalogs with current selections",
  trigger: "REFRESH",
  condition: () => true,
  apply: (_state) => ({
    asyncOps: [
      {
        id: "detect-providers-refresh",
        execute: async () => {
          const providers = await detectProviders();
          return { type: "PROVIDERS_DETECTED", providers };
        }
      },
      {
        id: "load-tokenizer-libs-refresh",
        execute: async () => {
          const libs = await listTokenizerLibsJson();
          return { type: "TOKENIZER_LIBS_LOADED", libs };
        }
      },
      {
        id: "load-sections-refresh",
        execute: async () => {
          const sections = await cliListSections();
          return { type: "SECTIONS_LOADED", sections };
        }
      },
      {
        id: "load-branches-refresh",
        execute: async () => {
          const branches = await getBranchNames();
          return { type: "BRANCHES_LOADED", branches };
        }
      }
    ]
  })
};

export const lifecycleRules = [
  initializeBootstrap,
  refreshCatalogs
];

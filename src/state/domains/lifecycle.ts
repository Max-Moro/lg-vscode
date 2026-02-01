/**
 * Lifecycle Domain - initialization and refresh
 *
 * Commands:
 * - lifecycle/INITIALIZE - initial bootstrap
 * - lifecycle/REFRESH - refresh all catalogs
 */

import type { BusinessRule, DomainModule, BaseCommand, ProviderInfo } from "../types";
import { cliListSections, cliListTokenizerLibs } from "../../cli/CliClient";

// ============================================
// External Dependencies (injected)
// ============================================

let detectProviders: () => Promise<ProviderInfo[]>;
let getBranchNames: () => Promise<string[]>;

export function setLifecycleDependencies(deps: {
  detectProviders: () => Promise<ProviderInfo[]>;
  getBranchNames: () => Promise<string[]>;
}): void {
  detectProviders = deps.detectProviders;
  getBranchNames = deps.getBranchNames;
}

// ============================================
// Commands
// ============================================

export interface InitializeCmd extends BaseCommand {
  type: "lifecycle/INITIALIZE";
}

export interface RefreshCmd extends BaseCommand {
  type: "lifecycle/REFRESH";
}

export type LifecycleCommand = InitializeCmd | RefreshCmd;

// ============================================
// Rules
// ============================================

const initialize: BusinessRule = {
  id: "lifecycle/initialize",
  description: "On initialize, detect providers and load all catalogs",
  trigger: "lifecycle/INITIALIZE",
  condition: () => {
    if (!detectProviders || !getBranchNames) {
      throw new Error("Lifecycle dependencies not set - call setLifecycleDependencies() before INITIALIZE");
    }
    return true;
  },
  apply: () => ({
    configMutations: {
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
          return { type: "provider/DETECTED", providers };
        }
      },
      {
        id: "load-tokenizer-libs",
        execute: async () => {
          const libs = await cliListTokenizerLibs();
          return { type: "tokenization/LIBS_LOADED", libs };
        }
      },
      {
        id: "load-sections",
        execute: async () => {
          const sections = await cliListSections();
          return { type: "section/LOADED", sections };
        }
      },
      {
        id: "load-branches",
        execute: async () => {
          const branches = await getBranchNames();
          return { type: "adaptive/BRANCHES_LOADED", branches };
        }
      }
    ]
  })
};

const refresh: BusinessRule = {
  id: "lifecycle/refresh",
  description: "On refresh, reload all catalogs with current selections",
  trigger: "lifecycle/REFRESH",
  condition: () => true,
  apply: () => ({
    asyncOps: [
      {
        id: "detect-providers-refresh",
        execute: async () => {
          const providers = await detectProviders();
          return { type: "provider/DETECTED", providers };
        }
      },
      {
        id: "load-tokenizer-libs-refresh",
        execute: async () => {
          const libs = await cliListTokenizerLibs();
          return { type: "tokenization/LIBS_LOADED", libs };
        }
      },
      {
        id: "load-sections-refresh",
        execute: async () => {
          const sections = await cliListSections();
          return { type: "section/LOADED", sections };
        }
      },
      {
        id: "load-branches-refresh",
        execute: async () => {
          const branches = await getBranchNames();
          return { type: "adaptive/BRANCHES_LOADED", branches };
        }
      }
    ]
  })
};

// ============================================
// Domain Module Export
// ============================================

export const lifecycleDomain: DomainModule = {
  id: "lifecycle",
  rules: [initialize, refresh]
};

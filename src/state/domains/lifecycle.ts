/**
 * Lifecycle Domain - initialization and refresh
 *
 * Commands:
 * - lifecycle/INITIALIZE - initial bootstrap (includes provider detection)
 * - lifecycle/REFRESH - refresh all catalogs (without provider detection)
 *
 * Both commands load ALL available catalogs from CLI.
 * The only difference: INITIALIZE includes provider detection, REFRESH does not.
 *
 * Catalogs are loaded if their dependencies exist in persistent state:
 * - tokenizer-libs, sections, branches — always (no dependencies)
 * - contexts — if providerId exists
 * - mode-sets — if providerId AND template exist
 * - tag-sets — if template exists
 */

import type { BusinessRule, DomainModule, BaseCommand, PCEState, ProviderInfo, AsyncOperation } from "../types";
import { cliListSections, cliListTokenizerLibs, cliListContexts, cliListModeSets, cliListTagSets } from "../../cli/CliClient";

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
// Shared Catalog Loading
// ============================================

/**
 * Build async operations for loading all available catalogs.
 *
 * @param state - Current PCE state (for checking available persistent data)
 * @param includeProviderDetection - Whether to include provider detection (INITIALIZE only)
 */
function buildCatalogOps(state: PCEState, includeProviderDetection: boolean): AsyncOperation[] {
  const { providerId, template } = state.persistent;
  const ops: AsyncOperation[] = [];

  // Provider detection (INITIALIZE only)
  if (includeProviderDetection) {
    ops.push({
      id: "detect-providers",
      execute: async () => {
        const providers = await detectProviders();
        return { type: "provider/DETECTED", providers };
      }
    });
  }

  // Independent catalogs (always load)
  ops.push(
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
  );

  // Contexts depend on provider
  if (providerId) {
    ops.push({
      id: "load-contexts",
      execute: async () => {
        const contexts = await cliListContexts(providerId);
        return { type: "context/LOADED", contexts };
      }
    });
  }

  // Mode-sets depend on provider AND template
  if (providerId && template) {
    ops.push({
      id: "load-mode-sets",
      execute: async () => {
        const modeSets = await cliListModeSets(template, providerId);
        return { type: "adaptive/MODE_SETS_LOADED", modeSets };
      }
    });
  }

  // Tag-sets depend only on template
  if (template) {
    ops.push({
      id: "load-tag-sets",
      execute: async () => {
        const tagSets = await cliListTagSets(template);
        return { type: "adaptive/TAG_SETS_LOADED", tagSets };
      }
    });
  }

  return ops;
}

// ============================================
// Rules
// ============================================

const initialize: BusinessRule = {
  id: "lifecycle/initialize",
  description: "On initialize, detect providers and load all available catalogs",
  trigger: "lifecycle/INITIALIZE",
  condition: () => {
    if (!detectProviders || !getBranchNames) {
      throw new Error("Lifecycle dependencies not set - call setLifecycleDependencies() before INITIALIZE");
    }
    return true;
  },
  apply: (state: PCEState) => ({
    asyncOps: buildCatalogOps(state, true)
  })
};

const refresh: BusinessRule = {
  id: "lifecycle/refresh",
  description: "On refresh, reload all available catalogs (no provider detection)",
  trigger: "lifecycle/REFRESH",
  condition: () => true,
  apply: (state: PCEState) => ({
    asyncOps: buildCatalogOps(state, false)
  })
};

// ============================================
// Domain Module Export
// ============================================

export const lifecycleDomain: DomainModule = {
  id: "lifecycle",
  rules: [initialize, refresh]
};

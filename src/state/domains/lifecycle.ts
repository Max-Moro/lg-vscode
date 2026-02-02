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
 * - tokenizer-libs, sections — always (no dependencies)
 * - contexts — if providerId exists
 * - mode-sets — if providerId AND template exist
 * - tag-sets — if template exists
 */

import { command, rule, type PCEState, type AsyncOperation } from "../types";
import { cliListSections, cliListTokenizerLibs, cliListContexts, cliListModeSets, cliListTagSets } from "../../cli/CliClient";
import { getAiService } from "../../bootstrap";

// ============================================
// Commands
// ============================================

export const Initialize = command("lifecycle/INITIALIZE").noPayload();
export const Refresh = command("lifecycle/REFRESH").noPayload();

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
        const aiService = getAiService();
        const providers = await aiService.detectAvailableProviders();
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

/** On initialize, detect providers and load all available catalogs */
rule(Initialize, {
  condition: () => true,
  apply: (state: PCEState) => ({
    asyncOps: buildCatalogOps(state, true)
  })
});

/** On refresh, reload all available catalogs (no provider detection) */
rule(Refresh, {
  condition: () => true,
  apply: (state: PCEState) => ({
    asyncOps: buildCatalogOps(state, false)
  })
});

/**
 * ViewModel Builder - Pure function transforming PCE State to ViewModel
 */

import type { PCEState } from "../state/types";
import type {
  ViewModel,
  SelectOption,
  EncoderOption,
  ModeSetViewModel,
  TagSetViewModel,
  ProviderSettingsContribution
} from "./types";
import { getAvailableShells } from "../models/ShellType";
import { getAiService } from "../bootstrap";

/**
 * Build ViewModel from PCE State
 *
 * This is a pure function with no side effects.
 * All transformation rules are consolidated here.
 *
 * @param state - Current PCE state
 * @returns ViewModel for rendering
 */
export function buildViewModel(state: PCEState): ViewModel {
  const { persistent: p, configuration: c, environment: e } = state;

  // Current context and provider for lookups
  const ctx = p.template;
  const provider = p.providerId;

  // Get current modes for this context+provider
  const currentModes = p.modesByContextProvider[ctx]?.[provider] || {};

  // Get current tags for this context
  const currentTags = p.tagsByContext[ctx] || {};

  // Check if review mode is active (any mode-set has "review" selected)
  const isReviewMode = Object.values(currentModes).includes("review");

  // Check provider type for visibility rules
  const isCliProvider = provider.endsWith(".cli");

  // Build providers options
  const providers: SelectOption[] = e.providers.map(p => ({
    value: p.id,
    label: p.name
  }));

  // Build contexts options
  // Strip non-informative "/_" suffix from display labels (CLI uses full path)
  const contexts: SelectOption[] = c.contexts.map(name => ({
    value: name,
    label: name.endsWith("/_") ? name.slice(0, -2) : name
  }));

  // Build sections options (extract names from SectionInfo)
  const sections: SelectOption[] = c.sections.map(sec => ({
    value: sec.name,
    label: sec.name
  }));

  // Build mode-sets view models
  const modeSets: ModeSetViewModel[] = c.modeSets["mode-sets"].map(ms => ({
    id: ms.id,
    title: ms.title,
    modes: ms.modes.map(m => ({
      id: m.id,
      title: m.title,
      description: m.description
    })),
    selectedModeId: currentModes[ms.id] || ms.modes[0]?.id || ""
  }));

  // Build tag-sets view models (exclude 'global')
  const tagSets: TagSetViewModel[] = c.tagSets["tag-sets"]
    .filter(ts => ts.id !== "global")
    .map(ts => {
      const selectedInSet = currentTags[ts.id] || [];
      return {
        id: ts.id,
        title: ts.title,
        expanded: selectedInSet.length > 0,
        tags: ts.tags.map(t => ({
          id: t.id,
          title: t.title,
          description: t.description,
          checked: selectedInSet.includes(t.id)
        }))
      };
    });

  // Count total selected tags
  const selectedTagsCount = Object.values(currentTags)
    .reduce((sum, tags) => sum + tags.length, 0);

  // Build branches options (from environment, loaded lazily on review mode)
  const branches: SelectOption[] = e.branches.map(b => ({
    value: b,
    label: b
  }));

  // Build tokenizer libs options
  const tokenizerLibs: SelectOption[] = c.tokenizerLibs.map(lib => ({
    value: lib,
    label: lib
  }));

  // Build encoders options
  const encoders: EncoderOption[] = c.encoders.map(enc => ({
    value: enc.name,
    label: enc.name,
    cached: enc.cached ?? false
  }));

  // Build CLI shells options (static, platform-dependent)
  const cliShells: SelectOption[] = getAvailableShells().map(s => ({
    value: s.id,
    label: s.label
  }));

  // Collect provider settings contributions
  let providerSettings: ProviderSettingsContribution[] = [];
  try {
    const aiService = getAiService();
    providerSettings = aiService.getAllSettingsModules()
      .map(module => module.buildContribution(state))
      .filter(contrib => contrib.visible);
  } catch {
    // During bootstrap, aiService may not be available yet
  }

  return {
    providers,
    selectedProviderId: provider,
    contexts,
    selectedContextId: ctx,
    sections,
    selectedSectionId: p.section,
    modeSets,
    tagSets,
    tagsButtonVisible: tagSets.some(ts => ts.tags.length > 0),
    selectedTagsCount,
    targetBranchVisible: isReviewMode && e.branches.length > 0,
    branches,
    selectedBranch: p.targetBranch,
    tokenizerLibs,
    selectedTokenizerLib: p.tokenizerLib,
    encoders,
    selectedEncoder: p.encoder,
    ctxLimit: p.ctxLimit,
    cliSettingsVisible: isCliProvider,
    cliScope: p.cliScope,
    cliShells,
    selectedShell: p.cliShell,
    providerSettings,
    taskText: p.taskText
  };
}

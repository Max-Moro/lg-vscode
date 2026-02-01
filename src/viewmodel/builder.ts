/**
 * ViewModel Builder - Pure function transforming PCE State to ViewModel
 */

import type { PCEState } from "../state/types";
import type {
  ViewModel,
  SelectOption,
  EncoderOption,
  ModeSetViewModel,
  TagSetViewModel
} from "./types";
import { getAvailableShells } from "../models/ShellType";
import { getAvailableClaudeModels } from "../models/ClaudeModel";
import { getAvailableClaudeMethods } from "../models/ClaudeIntegrationMethod";
import { getAvailableCodexReasoningEfforts } from "../models/CodexReasoningEffort";

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
  const isClaudeCli = provider === "com.anthropic.claude.cli";
  const isCodexCli = provider === "com.openai.codex.cli";

  // Build providers options
  const providers: SelectOption[] = e.providers.map(p => ({
    value: p.id,
    label: p.name
  }));

  // Build contexts options
  const contexts: SelectOption[] = c.contexts.map(name => ({
    value: name,
    label: name
  }));

  // Build sections options
  const sections: SelectOption[] = c.sections.map(name => ({
    value: name,
    label: name
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

  // Build branches options
  const branches: SelectOption[] = c.branches.map(b => ({
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

  // Build Claude models options (static)
  const claudeModels: SelectOption[] = getAvailableClaudeModels().map(m => ({
    value: m.id,
    label: m.label,
    description: m.description
  }));

  // Build Claude methods options (static)
  const claudeMethods: SelectOption[] = getAvailableClaudeMethods().map(m => ({
    value: m.id,
    label: m.label,
    description: m.description
  }));

  // Build Codex reasoning efforts options (static)
  const codexReasoningEfforts: SelectOption[] = getAvailableCodexReasoningEfforts().map(r => ({
    value: r.id,
    label: r.label,
    description: r.description
  }));

  return {
    // Provider selector
    providers,
    selectedProviderId: provider,

    // Context selector
    contexts,
    selectedContextId: ctx,

    // Section selector (Inspect panel)
    sections,
    selectedSectionId: p.section,

    // Mode-sets panels
    modeSets,

    // Tags panel (button visible only when there are non-empty tag sets)
    tagSets,
    tagsButtonVisible: tagSets.some(ts => ts.tags.length > 0),
    selectedTagsCount,

    // Target branch (visible only in review mode with available branches)
    targetBranchVisible: isReviewMode && c.branches.length > 0,
    branches,
    selectedBranch: p.targetBranch,

    // Tokenization settings
    tokenizerLibs,
    selectedTokenizerLib: p.tokenizerLib,
    encoders,
    selectedEncoder: p.encoder,
    ctxLimit: p.ctxLimit,

    // CLI settings (visible only for CLI providers)
    cliSettingsVisible: isCliProvider,
    cliScope: p.cliScope,
    cliShells,
    selectedShell: p.cliShell,

    // Claude-specific (visible only for Claude CLI)
    claudeSettingsVisible: isClaudeCli,
    claudeModels,
    selectedClaudeModel: p.claudeModel,
    claudeMethods,
    selectedClaudeMethod: p.claudeIntegrationMethod,

    // Codex-specific (visible only for Codex CLI)
    codexSettingsVisible: isCodexCli,
    codexReasoningEfforts,
    selectedCodexReasoning: p.codexReasoningEffort,

    // Task text
    taskText: p.taskText
  };
}

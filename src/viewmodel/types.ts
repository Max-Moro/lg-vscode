/**
 * ViewModel Types for Control Panel rendering
 */

// ============================================
// Common Types
// ============================================

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

export interface EncoderOption extends SelectOption {
  cached: boolean;
}

// ============================================
// Mode-Sets ViewModel
// ============================================

export interface ModeOption {
  id: string;
  title: string;
  description?: string;
}

export interface ModeSetViewModel {
  id: string;
  title: string;
  modes: ModeOption[];
  selectedModeId: string;
}

// ============================================
// Tag-Sets ViewModel
// ============================================

export interface TagOption {
  id: string;
  title: string;
  description?: string;
  checked: boolean;
}

export interface TagSetViewModel {
  id: string;
  title: string;
  expanded: boolean;
  tags: TagOption[];
}

// ============================================
// Main ViewModel
// ============================================

export interface ViewModel {
  // Provider selector
  providers: SelectOption[];
  selectedProviderId: string;

  // Context selector
  contexts: SelectOption[];
  selectedContextId: string;

  // Section selector (Inspect panel)
  sections: SelectOption[];
  selectedSectionId: string;

  // Mode-sets panels
  modeSets: ModeSetViewModel[];

  // Tags panel
  tagSets: TagSetViewModel[];
  tagsButtonVisible: boolean;
  selectedTagsCount: number;

  // Target branch (visible only in review mode)
  targetBranchVisible: boolean;
  branches: SelectOption[];
  selectedBranch: string;

  // Tokenization settings
  tokenizerLibs: SelectOption[];
  selectedTokenizerLib: string;
  encoders: EncoderOption[];
  selectedEncoder: string;
  ctxLimit: number;

  // CLI settings (visible only for CLI providers)
  cliSettingsVisible: boolean;
  cliScope: string;
  cliShells: SelectOption[];
  selectedShell: string;

  // Claude-specific (visible only for Claude CLI)
  claudeSettingsVisible: boolean;
  claudeModels: SelectOption[];
  selectedClaudeModel: string;
  claudeMethods: SelectOption[];
  selectedClaudeMethod: string;

  // Codex-specific (visible only for Codex CLI)
  codexSettingsVisible: boolean;
  codexReasoningEfforts: SelectOption[];
  selectedCodexReasoning: string;

  // Task text
  taskText: string;
}

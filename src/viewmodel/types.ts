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
// Provider Settings (Dynamic)
// ============================================

export interface ProviderSettingsField {
  /** DOM element id */
  id: string;
  /** Field type */
  type: "select" | "text";
  /** Label text */
  label: string;
  /** Options for select type */
  options?: SelectOption[];
  /** Current value */
  value: string;
  /** Command to emit on change */
  command: {
    type: string;
    payloadKey: string;
  };
}

export interface ProviderSettingsContribution {
  /** Provider ID */
  providerId: string;
  /** Section title (e.g., "Claude Settings") */
  title: string;
  /** Whether this section is visible */
  visible: boolean;
  /** Fields to render */
  fields: ProviderSettingsField[];
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

  // CLI settings (common for all CLI providers)
  cliSettingsVisible: boolean;
  cliScope: string;
  cliShells: SelectOption[];
  selectedShell: string;

  // Dynamic provider-specific settings
  providerSettings: ProviderSettingsContribution[];

  // Task text
  taskText: string;
}

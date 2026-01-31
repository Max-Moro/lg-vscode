/**
 * State Management Types for Control Panel
 *
 * PKO = Persistent + Konfig (Configuration) + Environment (O for Russian "Окружение")
 */

import type { ModeSetsList } from "../models/mode_sets_list";
import type { TagSetsList } from "../models/tag_sets_list";
import type { ShellType } from "../models/ShellType";
import type { ClaudeModel } from "../models/ClaudeModel";
import type { ClaudeIntegrationMethod } from "../models/ClaudeIntegrationMethod";
import type { CodexReasoningEffort } from "../models/CodexReasoningEffort";

// ============================================
// Persistent State (P) - saved between sessions
// ============================================

export interface PersistentState {
  // Selections
  providerId: string;
  template: string;                    // current context
  section: string;                     // for Inspect panel

  // Context-dependent selections
  modesByContextProvider: {
    [contextName: string]: {
      [providerId: string]: {
        [modeSetId: string]: string;   // selected modeId
      };
    };
  };
  tagsByContext: {
    [contextName: string]: {
      [tagSetId: string]: string[];    // selected tagIds
    };
  };

  // Tokenization
  tokenizerLib: string;
  encoder: string;
  ctxLimit: number;

  // CLI provider settings
  cliScope: string;
  cliShell: ShellType;
  claudeModel: ClaudeModel;
  claudeIntegrationMethod: ClaudeIntegrationMethod;
  codexReasoningEffort: CodexReasoningEffort;

  // Review mode
  targetBranch: string;

  // Task
  taskText: string;
}

// ============================================
// Configuration State (K) - loaded from CLI
// ============================================

export interface EncoderEntry {
  name: string;
  cached?: boolean;
}

export interface ConfigurationState {
  // Available options (from CLI)
  contexts: string[];                  // filtered by provider
  sections: string[];
  modeSets: ModeSetsList;              // filtered by context + provider
  tagSets: TagSetsList;                // filtered by context
  branches: string[];                  // from git

  // Tokenization options
  tokenizerLibs: string[];
  encoders: EncoderEntry[];            // filtered by tokenizerLib
}

// ============================================
// Environment State (O) - detected at startup
// ============================================

export interface ProviderInfo {
  id: string;
  name: string;
  priority: number;
}

export interface ShellDescriptor {
  id: ShellType;
  label: string;
}

export interface ClaudeModelDescriptor {
  id: ClaudeModel;
  label: string;
  description?: string;
}

export interface ClaudeMethodDescriptor {
  id: ClaudeIntegrationMethod;
  label: string;
  description?: string;
}

export interface CodexReasoningEffortDescriptor {
  id: CodexReasoningEffort;
  label: string;
  description?: string;
}

export interface EnvironmentState {
  // Available AI providers (detected)
  providers: ProviderInfo[];

  // Platform options
  cliShells: ShellDescriptor[];
  claudeModels: ClaudeModelDescriptor[];
  claudeIntegrationMethods: ClaudeMethodDescriptor[];
  codexReasoningEfforts: CodexReasoningEffortDescriptor[];
}

// ============================================
// Combined PKO State
// ============================================

export interface PKOState {
  persistent: PersistentState;
  configuration: ConfigurationState;
  environment: EnvironmentState;

  // Meta
  isStable: boolean;                   // false while async ops pending
  pendingOps: Set<string>;             // tracking async operations
}

// ============================================
// UI Meta State (separate from PKO)
// ============================================

export interface UIMeta {
  isLoading: boolean;
  // Future: error messages, notifications, etc.
}

// ============================================
// Commands
// ============================================

// User intent commands
export type UserCommand =
  | { type: "SELECT_PROVIDER"; providerId: string }
  | { type: "SELECT_CONTEXT"; template: string }
  | { type: "SELECT_SECTION"; section: string }
  | { type: "SELECT_MODE"; modeSetId: string; modeId: string }
  | { type: "TOGGLE_TAG"; tagSetId: string; tagId: string }
  | { type: "SET_TASK_TEXT"; text: string }
  | { type: "SELECT_TARGET_BRANCH"; branch: string }
  | { type: "SELECT_TOKENIZER_LIB"; lib: string }
  | { type: "SET_ENCODER"; encoder: string }
  | { type: "SET_CTX_LIMIT"; limit: number }
  | { type: "SET_CLI_SCOPE"; scope: string }
  | { type: "SELECT_CLI_SHELL"; shell: ShellType }
  | { type: "SELECT_CLAUDE_MODEL"; model: ClaudeModel }
  | { type: "SELECT_CLAUDE_METHOD"; method: ClaudeIntegrationMethod }
  | { type: "SELECT_CODEX_REASONING"; effort: CodexReasoningEffort };

// System commands (from CLI responses)
export type SystemCommand =
  | { type: "PROVIDERS_DETECTED"; providers: ProviderInfo[] }
  | { type: "CONTEXTS_LOADED"; contexts: string[] }
  | { type: "SECTIONS_LOADED"; sections: string[] }
  | { type: "MODE_SETS_LOADED"; modeSets: ModeSetsList }
  | { type: "TAG_SETS_LOADED"; tagSets: TagSetsList }
  | { type: "ENCODERS_LOADED"; encoders: EncoderEntry[] }
  | { type: "TOKENIZER_LIBS_LOADED"; libs: string[] }
  | { type: "BRANCHES_LOADED"; branches: string[] };

// Lifecycle commands
export type LifecycleCommand =
  | { type: "INITIALIZE" }
  | { type: "REFRESH" };

export type Command = UserCommand | SystemCommand | LifecycleCommand;

// ============================================
// Business Rules
// ============================================

export interface RuleResult {
  /** State mutations to apply */
  mutations?: Partial<PersistentState>;

  /** Configuration mutations to apply */
  configMutations?: Partial<ConfigurationState>;

  /** Async operations to initiate */
  asyncOps?: AsyncOperation[];

  /** Follow-up commands to dispatch */
  followUp?: Command[];
}

export interface AsyncOperation {
  id: string;
  execute: () => Promise<SystemCommand>;
}

/**
 * Typed business rule - trigger determines command type in callbacks
 */
export interface BusinessRule<T extends Command["type"] = Command["type"]> {
  /** Unique rule identifier for debugging */
  id: string;

  /** Human-readable description */
  description: string;

  /** Single command type that triggers this rule */
  trigger: T;

  /** Check if rule should be applied */
  condition: (state: PKOState, cmd: Extract<Command, { type: T }>) => boolean;

  /** Apply rule: returns state mutations and/or follow-up commands */
  apply: (state: PKOState, cmd: Extract<Command, { type: T }>) => RuleResult;
}

/** Helper type to create typed rule */
export type TypedRule<T extends Command["type"]> = BusinessRule<T>;

// ============================================
// Default State Factories
// ============================================

export function createDefaultPersistentState(): PersistentState {
  return {
    providerId: "",
    template: "",
    section: "",
    modesByContextProvider: {},
    tagsByContext: {},
    tokenizerLib: "tiktoken",
    encoder: "cl100k_base",
    ctxLimit: 128000,
    cliScope: "",
    cliShell: "bash",
    claudeModel: "sonnet",
    claudeIntegrationMethod: "session",
    codexReasoningEffort: "medium",
    targetBranch: "",
    taskText: ""
  };
}

export function createDefaultConfigurationState(): ConfigurationState {
  return {
    contexts: [],
    sections: [],
    modeSets: { "mode-sets": [] },
    tagSets: { "tag-sets": [] },
    branches: [],
    tokenizerLibs: [],
    encoders: []
  };
}

export function createDefaultEnvironmentState(): EnvironmentState {
  return {
    providers: [],
    cliShells: [],
    claudeModels: [],
    claudeIntegrationMethods: [],
    codexReasoningEfforts: []
  };
}

export function createDefaultPKOState(): PKOState {
  return {
    persistent: createDefaultPersistentState(),
    configuration: createDefaultConfigurationState(),
    environment: createDefaultEnvironmentState(),
    isStable: false,
    pendingOps: new Set()
  };
}

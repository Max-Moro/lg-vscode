/**
 * State Management Types for Control Panel
 *
 * PCE = Persistent + Configuration + Environment
 */

import type { ModeSetsList } from "../models/mode_sets_list";
import type { TagSetsList } from "../models/tag_sets_list";
import { type ShellType, getDefaultShell } from "../models/ShellType";
import type { EncoderEntry } from "../cli/CliClient";

// Re-export for convenience
export type { EncoderEntry } from "../cli/CliClient";

// ============================================
// Base Command Interface
// ============================================

export interface BaseCommand {
  type: string;
  [key: string]: unknown;
}

// ============================================
// Persistent State (P) - saved between sessions
// ============================================

export interface PersistentState {
  // Selections
  providerId: string;
  template: string;
  section: string;

  // Context-dependent selections
  modesByContextProvider: {
    [contextName: string]: {
      [providerId: string]: {
        [modeSetId: string]: string;
      };
    };
  };
  tagsByContext: {
    [contextName: string]: {
      [tagSetId: string]: string[];
    };
  };

  // Tokenization
  tokenizerLib: string;
  encoder: string;
  ctxLimit: number;

  // CLI provider settings (common)
  cliScope: string;
  cliShell: ShellType;

  // Review mode
  targetBranch: string;

  // Task
  taskText: string;

  // Provider-specific settings (extensible)
  providerSettings: Record<string, Record<string, unknown>>;
}

// ============================================
// Configuration State (C) - loaded from CLI
// ============================================

export interface ConfigurationState {
  contexts: string[];
  sections: string[];
  modeSets: ModeSetsList;
  tagSets: TagSetsList;
  branches: string[];
  tokenizerLibs: string[];
  encoders: EncoderEntry[];
}

// ============================================
// Environment State (E) - detected at startup
// ============================================

export interface ProviderInfo {
  id: string;
  name: string;
  priority: number;
}

export interface EnvironmentState {
  providers: ProviderInfo[];
}

// ============================================
// Combined PCE State
// ============================================

export interface PCEState {
  persistent: PersistentState;
  configuration: ConfigurationState;
  environment: EnvironmentState;
  isStable: boolean;
  pendingOps: Set<string>;
}

// ============================================
// UI Meta State
// ============================================

export interface UIMeta {
  isLoading: boolean;
}

// ============================================
// Business Rules
// ============================================

export interface RuleResult {
  mutations?: Partial<PersistentState>;
  configMutations?: Partial<ConfigurationState>;
  envMutations?: Partial<EnvironmentState>;
  asyncOps?: AsyncOperation[];
  followUp?: BaseCommand[];
}

export interface AsyncOperation {
  id: string;
  execute: () => Promise<BaseCommand>;
}

export interface BusinessRule {
  id: string;
  description: string;
  trigger: string;
  condition: (state: PCEState, cmd: BaseCommand) => boolean;
  apply: (state: PCEState, cmd: BaseCommand) => RuleResult;
}

// ============================================
// Domain Module Interface
// ============================================

export interface DomainModule {
  id: string;
  rules: BusinessRule[];
}

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
    cliShell: getDefaultShell(),
    targetBranch: "",
    taskText: "",
    providerSettings: {}
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
    providers: []
  };
}

export function createDefaultPCEState(): PCEState {
  return {
    persistent: createDefaultPersistentState(),
    configuration: createDefaultConfigurationState(),
    environment: createDefaultEnvironmentState(),
    isStable: false,
    pendingOps: new Set()
  };
}

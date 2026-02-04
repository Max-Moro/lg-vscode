/**
 * LG Extension State Types
 *
 * PCE = Persistent + Configuration + Environment
 */

import type { ModeSetsList } from "../models/mode_sets_list";
import type { TagSetsList } from "../models/tag_sets_list";
import type { SectionInfo } from "../models/sections_list";
import { type ShellType, getDefaultShell } from "../models/ShellType";

// Re-export engine types for convenience
export type { BaseCommand, RuleResult, AsyncOperation } from "../state-engine";

/**
 * Encoder entry with optional cached flag.
 */
export interface EncoderEntry {
  name: string;
  cached?: boolean;
}

// ============================================
// Provider Info
// ============================================

export interface ProviderInfo {
  id: string;
  name: string;
  priority: number;
}

// ============================================
// Persistent State (P) - saved between sessions
// ============================================

export interface PersistentState {
  providerId: string;
  template: string;
  section: string;
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
  tokenizerLib: string;
  encoder: string;
  ctxLimit: number;
  cliScope: string;
  cliShell: ShellType;
  targetBranch: string;
  taskText: string;
  providerSettings: Record<string, Record<string, unknown>>;
}

// ============================================
// Configuration State (C) - loaded from CLI
// ============================================

export interface ConfigurationState {
  contexts: string[];
  sections: SectionInfo[];
  modeSets: ModeSetsList;
  tagSets: TagSetsList;
  tokenizerLibs: string[];
  encoders: EncoderEntry[];
}

// ============================================
// Environment State (E) - detected at startup
// ============================================

export interface EnvironmentState {
  providers: ProviderInfo[];
  branches: string[];
}

// ============================================
// Combined PCE State (Business State Only)
// ============================================

export interface PCEState {
  persistent: PersistentState;
  configuration: ConfigurationState;
  environment: EnvironmentState;
  // NO isStable or pendingOps - those are coordinator's responsibility
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
    tokenizerLibs: [],
    encoders: []
  };
}

export function createDefaultEnvironmentState(): EnvironmentState {
  return {
    providers: [],
    branches: []
  };
}

export function createDefaultPCEState(): PCEState {
  return {
    persistent: createDefaultPersistentState(),
    configuration: createDefaultConfigurationState(),
    environment: createDefaultEnvironmentState()
  };
}

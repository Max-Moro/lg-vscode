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
// Command/Rule System
// ============================================

/**
 * Command definition created by command() factory
 */
export interface CommandDef<TType extends string, TPayload> {
  readonly type: TType;
  create(payload: TPayload): { type: TType } & TPayload;
}

/**
 * Command definition without payload
 */
export interface CommandDefNoPayload<TType extends string> {
  readonly type: TType;
  create(): { type: TType };
}

/**
 * Extract command type from definition
 */
export type CommandOf<TDef> =
  TDef extends CommandDef<infer T, infer P> ? { type: T } & P :
  TDef extends CommandDefNoPayload<infer T> ? { type: T } :
  never;

/**
 * Any command definition
 */
export type AnyCommandDef = CommandDef<string, unknown> | CommandDefNoPayload<string>;

// ============================================
// Global Registries
// ============================================

const ruleRegistry: BusinessRule[] = [];
let ruleCounter = 0;

/**
 * Define a command with payload.
 * The type string is specified once here and used everywhere.
 *
 * @example
 * export const SelectContext = command("context/SELECT").payload<{ template: string }>();
 *
 * // Create command instance (typed)
 * SelectContext.create({ template: "my-template" })
 *
 * // Extract type if needed
 * type SelectContextCmd = CommandOf<typeof SelectContext>;
 */
export function command<TType extends string>(type: TType) {
  return {
    payload: <TPayload>(): CommandDef<TType, TPayload> => ({
      type,
      create: (data: TPayload) => ({ type, ...data }) as { type: TType } & TPayload,
    }),
    noPayload: (): CommandDefNoPayload<TType> => ({
      type,
      create: () => ({ type }) as { type: TType },
    }),
  };
}

/**
 * Define a rule for a command. Auto-registers in global registry.
 *
 * @example
 * // Rule auto-registers when module is imported
 * rule(SelectContext, {
 *   condition: (state, cmd) => cmd.template !== state.persistent.template,
 *   apply: (state, cmd) => ({ mutations: { template: cmd.template } })
 * });
 */
export function rule<TDef extends AnyCommandDef>(
  cmd: TDef,
  config: {
    condition: (state: PCEState, cmd: CommandOf<TDef>) => boolean;
    apply: (state: PCEState, cmd: CommandOf<TDef>) => RuleResult;
  }
): void {
  ruleRegistry.push({
    id: `${cmd.type}#${++ruleCounter}`,
    trigger: cmd.type,
    condition: config.condition as (state: PCEState, cmd: BaseCommand) => boolean,
    apply: config.apply as (state: PCEState, cmd: BaseCommand) => RuleResult,
  });
}

/**
 * Get all registered rules. Call after all domain modules are imported.
 */
export function getAllRules(): BusinessRule[] {
  return ruleRegistry;
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
  trigger: string;
  condition: (state: PCEState, cmd: BaseCommand) => boolean;
  apply: (state: PCEState, cmd: BaseCommand) => RuleResult;
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

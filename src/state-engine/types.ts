/**
 * State Engine - Universal Types
 *
 * Generic types for command-driven state management with async operations.
 * Framework-agnostic, can be reused in other projects.
 */

// ============================================
// Base Command Interface
// ============================================

export interface BaseCommand {
  type: string;
  [key: string]: unknown;
}

// ============================================
// Rule System Types
// ============================================

/**
 * Result of applying a business rule.
 * Generic over state type to allow any state structure.
 */
export interface RuleResult<TState> {
  /** Partial state mutations to apply */
  mutations?: Partial<TState>;
  /** Async operations to execute */
  asyncOps?: AsyncOperation[];
  /** Follow-up commands to dispatch after mutations */
  followUp?: BaseCommand[];
}

/**
 * Async operation that produces a command when complete.
 */
export interface AsyncOperation {
  execute: () => Promise<BaseCommand>;
}

/**
 * Business rule definition.
 * Generic over state type for type-safe condition and apply functions.
 */
export interface BusinessRule<TState = unknown> {
  /** Command type that triggers this rule */
  trigger: string;
  /** Condition to check before applying */
  condition: (state: TState, cmd: BaseCommand) => boolean;
  /** Apply rule and return mutations/effects */
  apply: (state: TState, cmd: BaseCommand) => RuleResult<TState>;
}

// ============================================
// Command Definition Types
// ============================================

/**
 * Command definition with typed payload.
 */
export interface CommandDef<TType extends string, TPayload> {
  readonly type: TType;
  create(payload: TPayload): { type: TType } & TPayload;
}

/**
 * Command definition without payload.
 */
export interface CommandDefNoPayload<TType extends string> {
  readonly type: TType;
  create(): { type: TType };
}

/**
 * Extract command type from definition.
 */
export type CommandOf<TDef> =
  TDef extends CommandDef<infer T, infer P> ? { type: T } & P :
  TDef extends CommandDefNoPayload<infer T> ? { type: T } :
  never;

/**
 * Any command definition (union type).
 */
export type AnyCommandDef = CommandDef<string, unknown> | CommandDefNoPayload<string>;

// ============================================
// Coordinator Types
// ============================================

/**
 * UI meta state for loading indicators.
 */
export interface UIMeta {
  isLoading: boolean;
}

/**
 * Listener for UI meta changes.
 */
export type MetaListener = (meta: UIMeta) => void;

/**
 * Listener for state changes.
 */
export type StateListener<TState> = (state: TState) => void;

/**
 * Store interface for state management.
 *
 * Only responsible for storing and updating business state.
 * Coordination (stability, pending ops) is handled by StateCoordinator.
 */
export interface StateStore<TState> {
  /** Get current state */
  getState(): TState;

  /** Apply mutations from rule result */
  applyMutations(result: RuleResult<TState>): Promise<void>;

  /** Emit state change to subscribers */
  emit(): void;

  /** Subscribe to state changes */
  subscribe(listener: StateListener<TState>): () => void;
}

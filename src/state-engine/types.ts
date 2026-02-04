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
 * Async operation that produces a command when complete.
 */
export interface AsyncOperation {
  execute: () => Promise<BaseCommand>;
}

/**
 * Base result of applying a business rule.
 * Contains only coordination fields - mutations are application-specific.
 *
 * Applications extend this interface to add their own mutation types.
 */
export interface RuleResult {
  /** Async operations to execute */
  asyncOps?: AsyncOperation[];
  /** Follow-up commands to dispatch after mutations */
  followUp?: BaseCommand[];
}

/**
 * Business rule definition.
 * Generic over state type and result type for flexibility.
 *
 * @typeParam TState - Application state type
 * @typeParam TResult - Rule result type (must extend RuleResult)
 */
export interface BusinessRule<TState = unknown, TResult extends RuleResult = RuleResult> {
  /** Command type that triggers this rule */
  trigger: string;
  /** Condition to check before applying */
  condition: (state: TState, cmd: BaseCommand) => boolean;
  /** Apply rule and return mutations/effects */
  apply: (state: TState, cmd: BaseCommand) => TResult;
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
 *
 * @typeParam TState - Application state type
 * @typeParam TResult - Rule result type (for applyMutations)
 */
export interface StateStore<TState, TResult extends RuleResult = RuleResult> {
  /** Get current state */
  getState(): TState;

  /** Apply mutations from rule result (implementation handles specific mutation types) */
  applyMutations(result: TResult): Promise<void>;

  /** Emit state change to subscribers */
  emit(): void;

  /** Subscribe to state changes */
  subscribe(listener: StateListener<TState>): () => void;
}

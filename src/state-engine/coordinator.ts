/**
 * State Engine - State Coordinator
 *
 * Orchestrates command processing through business rules.
 * Generic over state type for reusability.
 */

import type {
  BaseCommand,
  BusinessRule,
  RuleResult,
  AsyncOperation,
  UIMeta,
  MetaListener,
  StateStore
} from "./types";

/**
 * Logger interface for debugging.
 */
export interface CoordinatorLogger {
  debug(msg: string): void;
  error(msg: string, error?: unknown): void;
}

/**
 * No-op logger for production.
 */
export const nullLogger: CoordinatorLogger = {
  debug: () => {},
  error: () => {}
};

/**
 * State Coordinator - orchestrates command processing.
 *
 * Responsibilities:
 * - Process commands through business rules
 * - Manage async operations
 * - Track state stability
 * - Emit state changes when stable
 *
 * @typeParam TState - Application state type
 * @typeParam TResult - Rule result type (must extend RuleResult)
 */
export class StateCoordinator<TState, TResult extends RuleResult = RuleResult> {
  private rules: BusinessRule<TState, TResult>[] = [];
  private metaListeners: Set<MetaListener> = new Set();
  private pendingPromises: Promise<void>[] = [];
  private pendingOps = 0;
  private logger: CoordinatorLogger;

  constructor(
    private readonly store: StateStore<TState, TResult>,
    logger?: CoordinatorLogger
  ) {
    this.logger = logger ?? nullLogger;
  }

  /**
   * Set business rules for this coordinator.
   */
  setRules(rules: BusinessRule<TState, TResult>[]): void {
    this.rules = rules;
    this.logger.debug(`Registered ${rules.length} business rules`);
  }

  /**
   * Check if state is stable (no pending async operations).
   */
  isStable(): boolean {
    return this.pendingOps === 0;
  }

  /**
   * Process a command through the rules engine.
   */
  async dispatch(command: BaseCommand): Promise<void> {
    this.logger.debug(`Dispatching command: ${command.type}`);

    const state = this.store.getState();

    // Find applicable rules
    const applicableRules = this.rules.filter(rule =>
      rule.trigger === command.type &&
      rule.condition(state, command)
    );

    if (applicableRules.length === 0) {
      this.logger.debug(`No rules matched for ${command.type}`);
      return;
    }

    this.logger.debug(`${applicableRules.length} rules matched for ${command.type}`);

    // Apply rules and collect results
    const allAsyncOps: AsyncOperation[] = [];
    const allFollowUps: BaseCommand[] = [];

    for (const rule of applicableRules) {
      try {
        const result = rule.apply(state, command);

        // Apply mutations via store (store handles empty results gracefully)
        await this.store.applyMutations(result);

        // Collect async ops
        if (result.asyncOps) {
          allAsyncOps.push(...result.asyncOps);
        }

        // Collect follow-ups
        if (result.followUp) {
          allFollowUps.push(...result.followUp);
        }
      } catch (e) {
        this.logger.error(`Rule for ${rule.trigger} failed`, e);
      }
    }

    // Start async operations
    for (const op of allAsyncOps) {
      this.startAsyncOp(op);
    }

    // Update stability and emit if stable
    this.checkAndEmit();

    // Process follow-up commands sequentially
    for (const followUp of allFollowUps) {
      await this.dispatch(followUp);
    }
  }

  /**
   * Start an async operation.
   */
  private startAsyncOp(op: AsyncOperation): void {
    this.pendingOps++;
    this.emitMeta();

    const promise = op.execute()
      .then(async (resultCommand) => {
        this.pendingOps--;
        await this.dispatch(resultCommand);
      })
      .catch((error) => {
        this.pendingOps--;
        this.logger.error(`Async op failed`, error);
        this.checkAndEmit();
      });

    this.pendingPromises.push(promise);
  }

  /**
   * Check stability and emit state if stable.
   */
  private checkAndEmit(): void {
    if (this.isStable()) {
      this.logger.debug("State is stable, emitting");
      this.store.emit();
    }
    this.emitMeta();
  }

  /**
   * Emit UI meta state.
   */
  private emitMeta(): void {
    const meta: UIMeta = {
      isLoading: !this.isStable()
    };

    for (const listener of this.metaListeners) {
      try {
        listener(meta);
      } catch (e) {
        this.logger.debug(`Meta listener error: ${e}`);
      }
    }
  }

  /**
   * Subscribe to UI meta changes (loading state).
   */
  subscribeToMeta(listener: MetaListener): () => void {
    this.metaListeners.add(listener);
    return () => {
      this.metaListeners.delete(listener);
    };
  }

  /**
   * Wait for all pending operations to complete.
   */
  async waitForStability(): Promise<void> {
    while (this.pendingPromises.length > 0) {
      const promises = this.pendingPromises.slice();
      this.pendingPromises.length = 0;
      await Promise.all(promises);
    }
  }
}

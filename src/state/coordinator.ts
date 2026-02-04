/**
 * State Coordinator - Orchestrates command processing and async operations
 */

import type { AsyncOperation, BusinessRule, BaseCommand, UIMeta } from "./types";
import { PCEStateStore } from "./store";
import { logDebug, logError } from "../logging/log";

type MetaListener = (meta: UIMeta) => void;

/**
 * State Coordinator
 *
 * Orchestrates:
 * - Command processing through business rules
 * - Async operation management
 * - State stability tracking
 * - Event emission
 */
export class StateCoordinator {
  private rules: BusinessRule[] = [];
  private metaListeners: Set<MetaListener> = new Set();
  private pendingPromises: Promise<void>[] = [];

  constructor(
    private readonly store: PCEStateStore
  ) {}

  /**
   * Register business rules
   */
  public setRules(rules: Array<BusinessRule>): void {
    this.rules = rules;
    logDebug(`[StateCoordinator] Registered ${rules.length} business rules`);
  }

  /**
   * Process a command through the rules engine
   */
  public async dispatch(command: BaseCommand): Promise<void> {
    logDebug(`[StateCoordinator] Dispatching command: ${command.type}`);

    const state = this.store.getState();

    // 1. Find applicable rules
    const applicableRules = this.rules.filter(rule =>
      rule.trigger === command.type &&
      rule.condition(state, command)
    );

    if (applicableRules.length === 0) {
      logDebug(`[StateCoordinator] No rules matched for ${command.type}`);
      return;
    }

    logDebug(`[StateCoordinator] ${applicableRules.length} rules matched for ${command.type}`);

    // 2. Apply rules and collect results
    const allAsyncOps: AsyncOperation[] = [];
    const allFollowUps: BaseCommand[] = [];

    for (const rule of applicableRules) {
      try {
        const result = rule.apply(state, command);

        // Apply persistent mutations
        if (result.mutations && Object.keys(result.mutations).length > 0) {
          await this.store.updatePersistent(result.mutations);
        }

        // Apply configuration mutations
        if (result.configMutations && Object.keys(result.configMutations).length > 0) {
          this.store.updateConfiguration(result.configMutations);
        }

        // Apply environment mutations
        if (result.envMutations && Object.keys(result.envMutations).length > 0) {
          this.store.updateEnvironment(result.envMutations);
        }

        // Collect async ops
        if (result.asyncOps) {
          allAsyncOps.push(...result.asyncOps);
        }

        // Collect follow-ups
        if (result.followUp) {
          allFollowUps.push(...result.followUp);
        }
      } catch (e) {
        logError(`[StateCoordinator] Rule for ${rule.trigger} failed`, e);
      }
    }

    // 3. Start async operations
    for (const op of allAsyncOps) {
      this.startAsyncOp(op);
    }

    // 4. Update stability and emit if stable
    this.checkAndEmit();

    // 5. Process follow-up commands sequentially
    for (const followUp of allFollowUps) {
      await this.dispatch(followUp);
    }
  }

  /**
   * Start an async operation
   */
  private startAsyncOp(op: AsyncOperation): void {
    this.store.addPendingOp();
    this.emitMeta();

    const promise = op.execute()
      .then(async (resultCommand) => {
        this.store.removePendingOp();
        await this.dispatch(resultCommand);
      })
      .catch((error) => {
        this.store.removePendingOp();
        logError(`[StateCoordinator] Async op failed`, error);
        this.checkAndEmit();
      });

    this.pendingPromises.push(promise);
  }

  /**
   * Check stability and emit state if stable
   */
  private checkAndEmit(): void {
    const state = this.store.getState();

    if (state.isStable) {
      logDebug("[StateCoordinator] State is stable, emitting");
      this.store.emit();
    }

    // Emit meta change if loading state changed
    this.emitMeta();
  }

  /**
   * Emit UI meta state
   */
  private emitMeta(): void {
    const state = this.store.getState();
    const meta: UIMeta = {
      isLoading: !state.isStable
    };

    for (const listener of this.metaListeners) {
      try {
        listener(meta);
      } catch (e) {
        logDebug(`[StateCoordinator] Meta listener error: ${e}`);
      }
    }
  }

  /**
   * Subscribe to UI meta changes (loading state)
   */
  public subscribeToMeta(listener: MetaListener): () => void {
    this.metaListeners.add(listener);
    return () => {
      this.metaListeners.delete(listener);
    };
  }

  /**
   * Wait for all pending operations to complete
   */
  public async waitForStability(): Promise<void> {
    while (this.pendingPromises.length > 0) {
      const promises = this.pendingPromises.slice();
      this.pendingPromises.length = 0;
      await Promise.all(promises);
    }
  }
}


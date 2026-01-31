/**
 * State Coordinator - Orchestrates command processing and async operations
 */

import * as _vscode from "vscode";
import type {
  Command,
  BusinessRule,
  AsyncOperation,
  UIMeta
} from "./types";
import { PKOStateStore } from "./store";
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
  private pendingPromises = new Map<string, Promise<void>>();

  constructor(
    private readonly store: PKOStateStore
  ) {}

  /**
   * Register business rules
   */
  public setRules(rules: BusinessRule[]): void {
    this.rules = rules;
    logDebug(`[StateCoordinator] Registered ${rules.length} business rules`);
  }

  /**
   * Process a command through the rules engine
   */
  public async dispatch(command: Command): Promise<void> {
    logDebug(`[StateCoordinator] Dispatching command: ${command.type}`);

    const state = this.store.getState();

    // 1. Find applicable rules
    const applicableRules = this.rules.filter(rule =>
      rule.trigger === command.type &&
      rule.condition(state, command as never)
    );

    if (applicableRules.length === 0) {
      logDebug(`[StateCoordinator] No rules matched for ${command.type}`);
      return;
    }

    logDebug(`[StateCoordinator] ${applicableRules.length} rules matched: ${applicableRules.map(r => r.id).join(", ")}`);

    // 2. Apply rules and collect results
    const allAsyncOps: AsyncOperation[] = [];
    const allFollowUps: Command[] = [];

    for (const rule of applicableRules) {
      try {
        const result = rule.apply(state, command as never);

        // Apply persistent mutations
        if (result.mutations && Object.keys(result.mutations).length > 0) {
          await this.store.updatePersistent(result.mutations);
        }

        // Apply configuration mutations
        if (result.configMutations && Object.keys(result.configMutations).length > 0) {
          this.store.updateConfiguration(result.configMutations);
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
        logError(`[StateCoordinator] Rule ${rule.id} failed`, e);
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
    logDebug(`[StateCoordinator] Starting async op: ${op.id}`);

    // Mark as pending
    this.store.addPendingOp(op.id);
    this.emitMeta();

    // Execute and handle result
    const promise = op.execute()
      .then(async (resultCommand) => {
        this.store.removePendingOp(op.id);
        logDebug(`[StateCoordinator] Async op completed: ${op.id}`);
        await this.dispatch(resultCommand);
      })
      .catch((error) => {
        this.store.removePendingOp(op.id);
        logError(`[StateCoordinator] Async op ${op.id} failed`, error);
        this.checkAndEmit();
      });

    this.pendingPromises.set(op.id, promise);
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
    const promises = Array.from(this.pendingPromises.values());
    if (promises.length > 0) {
      await Promise.all(promises);
    }
  }
}

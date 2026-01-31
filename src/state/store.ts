/**
 * PKO State Store - Single source of truth for Control Panel state
 */

import * as vscode from "vscode";
import type {
  PKOState,
  PersistentState,
  ConfigurationState,
  EnvironmentState
} from "./types";
import {
  createDefaultPKOState,
  createDefaultPersistentState
} from "./types";
import { logDebug } from "../logging/log";

const STATE_KEY = "lg.control.pkoState";

type StateListener = (state: PKOState) => void;

/**
 * PKO State Store
 *
 * Manages the unified state for Control Panel:
 * - Persistent state (saved to workspaceState)
 * - Configuration state (from CLI)
 * - Environment state (detected)
 *
 * Provides subscription mechanism for state changes.
 */
export class PKOStateStore {
  private static instance: PKOStateStore | undefined;

  private state: PKOState;
  private listeners: Set<StateListener> = new Set();

  private constructor(
    private readonly context: vscode.ExtensionContext
  ) {
    // Load persistent state from storage, merge with defaults
    const savedPersistent = context.workspaceState.get<Partial<PersistentState>>(STATE_KEY);
    const persistent = {
      ...createDefaultPersistentState(),
      ...savedPersistent
    };

    this.state = {
      ...createDefaultPKOState(),
      persistent
    };

    logDebug("[PKOStateStore] Initialized with persistent state from storage");
  }

  /**
   * Get singleton instance
   */
  public static getInstance(context: vscode.ExtensionContext): PKOStateStore {
    if (!PKOStateStore.instance) {
      PKOStateStore.instance = new PKOStateStore(context);
    }
    return PKOStateStore.instance;
  }

  /**
   * Get current state (immutable snapshot)
   */
  public getState(): PKOState {
    return this.state;
  }

  /**
   * Get persistent state only
   */
  public getPersistentState(): PersistentState {
    return this.state.persistent;
  }

  /**
   * Update persistent state (partial merge)
   */
  public async updatePersistent(partial: Partial<PersistentState>): Promise<void> {
    const newPersistent = {
      ...this.state.persistent,
      ...partial
    };

    this.state = {
      ...this.state,
      persistent: newPersistent
    };

    // Save to storage
    await this.context.workspaceState.update(STATE_KEY, newPersistent);

    logDebug(`[PKOStateStore] Persistent state updated: ${Object.keys(partial).join(", ")}`);
  }

  /**
   * Update configuration state (full replacement of specified fields)
   */
  public updateConfiguration(partial: Partial<ConfigurationState>): void {
    this.state = {
      ...this.state,
      configuration: {
        ...this.state.configuration,
        ...partial
      }
    };

    logDebug(`[PKOStateStore] Configuration state updated: ${Object.keys(partial).join(", ")}`);
  }

  /**
   * Update environment state (full replacement)
   */
  public updateEnvironment(env: EnvironmentState): void {
    this.state = {
      ...this.state,
      environment: env
    };

    logDebug("[PKOStateStore] Environment state updated");
  }

  /**
   * Update stability flag and pending operations
   */
  public updateStability(isStable: boolean, pendingOps?: Set<string>): void {
    this.state = {
      ...this.state,
      isStable,
      pendingOps: pendingOps ?? this.state.pendingOps
    };
  }

  /**
   * Add a pending operation
   */
  public addPendingOp(opId: string): void {
    const newPending = new Set(this.state.pendingOps);
    newPending.add(opId);
    this.state = {
      ...this.state,
      isStable: false,
      pendingOps: newPending
    };
  }

  /**
   * Remove a pending operation
   */
  public removePendingOp(opId: string): void {
    const newPending = new Set(this.state.pendingOps);
    newPending.delete(opId);
    const isStable = newPending.size === 0;
    this.state = {
      ...this.state,
      isStable,
      pendingOps: newPending
    };
  }

  /**
   * Emit state change to all listeners
   */
  public emit(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (e) {
        logDebug(`[PKOStateStore] Listener error: ${e}`);
      }
    }
  }

  /**
   * Subscribe to state changes
   * @returns Unsubscribe function
   */
  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Reset state to defaults (for testing)
   */
  public async reset(): Promise<void> {
    this.state = createDefaultPKOState();
    await this.context.workspaceState.update(STATE_KEY, undefined);
    logDebug("[PKOStateStore] State reset to defaults");
  }

  // ============================================
  // Query Methods (computed values)
  // ============================================

  /**
   * Get current modes for context and provider
   */
  public getCurrentModes(ctx: string, provider: string): Record<string, string> {
    return this.state.persistent.modesByContextProvider[ctx]?.[provider] ?? {};
  }

  /**
   * Get current tags for context
   */
  public getCurrentTags(ctx: string): Record<string, string[]> {
    return this.state.persistent.tagsByContext[ctx] ?? {};
  }

  /**
   * Check if review mode is active
   */
  public isReviewModeActive(ctx: string, provider: string): boolean {
    const modes = this.getCurrentModes(ctx, provider);
    return Object.values(modes).some(mode => mode === "review");
  }

  /**
   * Get integration mode runs string for current selection
   */
  public getIntegrationModeRuns(ctx: string, provider: string): string | null {
    const modeSets = this.state.configuration.modeSets;
    const integrationSet = modeSets["mode-sets"]?.find(ms => ms.integration === true);

    if (!integrationSet) {
      return null;
    }

    const currentModes = this.getCurrentModes(ctx, provider);
    const selectedModeId = currentModes[integrationSet.id];

    if (!selectedModeId) {
      // No mode selected, try first mode
      const firstMode = integrationSet.modes[0];
      return firstMode?.runs?.[provider] ?? null;
    }

    const mode = integrationSet.modes.find(m => m.id === selectedModeId);
    return mode?.runs?.[provider] ?? null;
  }
}

/**
 * Get PKO Store instance (convenience function)
 */
export function getPKOStore(context: vscode.ExtensionContext): PKOStateStore {
  return PKOStateStore.getInstance(context);
}

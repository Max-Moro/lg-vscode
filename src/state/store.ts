/**
 * PCE State Store - Single source of truth for Control Panel state
 */

import * as vscode from "vscode";
import type {
  PCEState,
  PersistentState,
  ConfigurationState,
  EnvironmentState
} from "./types";
import {
  createDefaultPCEState,
  createDefaultPersistentState
} from "./types";
import { logDebug } from "../logging/log";

const STATE_KEY = "lg.control.pceState";

type StateListener = (state: PCEState) => void;

/**
 * PCE State Store
 *
 * Manages the unified state for Control Panel:
 * - Persistent state (saved to workspaceState)
 * - Configuration state (from CLI)
 * - Environment state (detected)
 *
 * Provides subscription mechanism for state changes.
 */
export class PCEStateStore {
  private static instance: PCEStateStore | undefined;

  private state: PCEState;
  private listeners: Set<StateListener> = new Set();

  private constructor(
    private readonly workspaceState: vscode.Memento
  ) {
    // Load persistent state from storage, merge with defaults
    const savedPersistent = workspaceState.get<Partial<PersistentState>>(STATE_KEY);
    const persistent = {
      ...createDefaultPersistentState(),
      ...savedPersistent
    };

    this.state = {
      ...createDefaultPCEState(),
      persistent
    };

    logDebug("[PCEStateStore] Initialized with persistent state from storage");
  }

  /**
   * Create singleton instance. Called once by bootstrap.
   * @throws Error if already initialized
   */
  public static createInstance(workspaceState: vscode.Memento): PCEStateStore {
    if (PCEStateStore.instance) {
      throw new Error("PCEStateStore already initialized");
    }
    PCEStateStore.instance = new PCEStateStore(workspaceState);
    return PCEStateStore.instance;
  }

  /**
   * Get current state (immutable snapshot)
   */
  public getState(): PCEState {
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
    await this.workspaceState.update(STATE_KEY, newPersistent);

    logDebug(`[PCEStateStore] Persistent state updated: ${Object.keys(partial).join(", ")}`);
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

    logDebug(`[PCEStateStore] Configuration state updated: ${Object.keys(partial).join(", ")}`);
  }

  /**
   * Update environment state (partial merge)
   */
  public updateEnvironment(partial: Partial<EnvironmentState>): void {
    this.state = {
      ...this.state,
      environment: {
        ...this.state.environment,
        ...partial
      }
    };

    logDebug(`[PCEStateStore] Environment state updated: ${Object.keys(partial).join(", ")}`);
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
   * Clear all state (for debugging/testing).
   * Resets PCE state to defaults and clears workspaceState.
   */
  public async clearAll(): Promise<void> {
    // Reset in-memory state to defaults
    this.state = createDefaultPCEState();

    // Clear persistent state from storage
    await this.workspaceState.update(STATE_KEY, undefined);

    logDebug("[PCEStateStore] All state cleared");
  }

  /**
   * Emit state change to all listeners
   */
  public emit(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (e) {
        logDebug(`[PCEStateStore] Listener error: ${e}`);
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

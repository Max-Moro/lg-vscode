/**
 * LG Extension State Store
 *
 * Implements StateStore interface for PCEState.
 * Manages persistent, configuration, and environment state.
 *
 * NO coordination logic - that's StateCoordinator's responsibility.
 */

import * as vscode from "vscode";
import type { StateStore, RuleResult, StateListener, AsyncOperation, BaseCommand } from "../state-engine";
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

/**
 * Extended rule result for LG with separate mutation types for persistent, config, and environment.
 * Still includes asyncOps and followUp from the base RuleResult.
 */
export interface LGRuleResult {
  /** Mutations to persistent state only */
  mutations?: Partial<PersistentState>;
  /** Mutations to configuration state */
  configMutations?: Partial<ConfigurationState>;
  /** Mutations to environment state */
  envMutations?: Partial<EnvironmentState>;
  /** Async operations to execute */
  asyncOps?: AsyncOperation[];
  /** Follow-up commands to dispatch */
  followUp?: BaseCommand[];
}

/**
 * PCE State Store - single source of truth for Control Panel state.
 *
 * Implements StateStore<PCEState> for use with StateCoordinator.
 */
export class PCEStateStore implements StateStore<PCEState> {
  private static instance: PCEStateStore | undefined;

  private state: PCEState;
  private listeners: Set<StateListener<PCEState>> = new Set();

  private constructor(
    private readonly workspaceState: vscode.Memento
  ) {
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
   */
  static createInstance(workspaceState: vscode.Memento): PCEStateStore {
    if (PCEStateStore.instance) {
      throw new Error("PCEStateStore already initialized");
    }
    PCEStateStore.instance = new PCEStateStore(workspaceState);
    return PCEStateStore.instance;
  }

  // ============================================
  // StateStore Interface Implementation
  // ============================================

  getState(): PCEState {
    return this.state;
  }

  /**
   * Apply mutations from rule result.
   * Handles LG-specific mutation structure (mutations, configMutations, envMutations).
   */
  async applyMutations(result: RuleResult<PCEState>): Promise<void> {
    // Cast to LGRuleResult to access LG-specific fields
    const lgResult = result as unknown as LGRuleResult;

    if (lgResult.mutations && Object.keys(lgResult.mutations).length > 0) {
      await this.updatePersistent(lgResult.mutations);
    }

    if (lgResult.configMutations && Object.keys(lgResult.configMutations).length > 0) {
      this.updateConfiguration(lgResult.configMutations);
    }

    if (lgResult.envMutations && Object.keys(lgResult.envMutations).length > 0) {
      this.updateEnvironment(lgResult.envMutations);
    }
  }

  emit(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (e) {
        logDebug(`[PCEStateStore] Listener error: ${e}`);
      }
    }
  }

  subscribe(listener: StateListener<PCEState>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ============================================
  // LG-Specific Methods
  // ============================================

  getPersistentState(): PersistentState {
    return this.state.persistent;
  }

  async updatePersistent(partial: Partial<PersistentState>): Promise<void> {
    const newPersistent = {
      ...this.state.persistent,
      ...partial
    };

    this.state = {
      ...this.state,
      persistent: newPersistent
    };

    await this.workspaceState.update(STATE_KEY, newPersistent);
    logDebug(`[PCEStateStore] Persistent state updated: ${Object.keys(partial).join(", ")}`);
  }

  updateConfiguration(partial: Partial<ConfigurationState>): void {
    this.state = {
      ...this.state,
      configuration: {
        ...this.state.configuration,
        ...partial
      }
    };
    logDebug(`[PCEStateStore] Configuration state updated: ${Object.keys(partial).join(", ")}`);
  }

  updateEnvironment(partial: Partial<EnvironmentState>): void {
    this.state = {
      ...this.state,
      environment: {
        ...this.state.environment,
        ...partial
      }
    };
    logDebug(`[PCEStateStore] Environment state updated: ${Object.keys(partial).join(", ")}`);
  }

  async clearAll(): Promise<void> {
    this.state = createDefaultPCEState();
    await this.workspaceState.update(STATE_KEY, undefined);
    logDebug("[PCEStateStore] All state cleared");
  }

  // ============================================
  // Query Methods
  // ============================================

  getCurrentModes(ctx: string, provider: string): Record<string, string> {
    return this.state.persistent.modesByContextProvider[ctx]?.[provider] ?? {};
  }

  getCurrentTags(ctx: string): Record<string, string[]> {
    return this.state.persistent.tagsByContext[ctx] ?? {};
  }

  isReviewModeActive(ctx: string, provider: string): boolean {
    const modes = this.getCurrentModes(ctx, provider);
    return Object.values(modes).some(mode => mode === "review");
  }

  getIntegrationModeRuns(ctx: string, provider: string): string | null {
    const modeSets = this.state.configuration.modeSets;
    const integrationSet = modeSets["mode-sets"]?.find(ms => ms.integration === true);

    if (!integrationSet) {
      return null;
    }

    const currentModes = this.getCurrentModes(ctx, provider);
    const selectedModeId = currentModes[integrationSet.id];

    if (!selectedModeId) {
      const firstMode = integrationSet.modes[0];
      return firstMode?.runs?.[provider] ?? null;
    }

    const mode = integrationSet.modes.find(m => m.id === selectedModeId);
    return mode?.runs?.[provider] ?? null;
  }
}

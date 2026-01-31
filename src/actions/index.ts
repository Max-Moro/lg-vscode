/**
 * Action Dispatcher - Central routing for all business actions
 */

import type { PCEStateStore } from "../state/store";
import type { StateCoordinator } from "../state/coordinator";
import type { ListingService } from "../services/ListingService";
import type { ContextService } from "../services/ContextService";
import type { AiIntegrationService } from "../services/ai";
import type { VirtualDocProvider } from "../views/VirtualDocProvider";
import type { IncludedTree } from "../views/IncludedTree";
import type { RunResult } from "../models/report";

import * as ListingActions from "./ListingActions";
import * as ContextActions from "./ContextActions";
import * as AiActions from "./AiActions";
import * as ToolbarActions from "./ToolbarActions";

export interface ActionDispatcherDeps {
  store: PCEStateStore;
  coordinator: StateCoordinator;
  listingService: ListingService;
  contextService: ContextService;
  aiService: AiIntegrationService;
  vdocs: VirtualDocProvider;
  included: IncludedTree;
  showStats: (data: RunResult, refreshFn: () => Promise<RunResult>) => Promise<void>;
}

/**
 * Central dispatcher for all business actions
 */
export class ActionDispatcher {
  constructor(private readonly deps: ActionDispatcherDeps) {}

  // ==================== Listing Actions ====================

  async generateListing(): Promise<void> {
    await ListingActions.generateListing(this.deps);
  }

  async showIncluded(): Promise<void> {
    await ListingActions.showIncluded(this.deps);
  }

  async showSectionStats(): Promise<void> {
    await ListingActions.showSectionStats(this.deps);
  }

  // ==================== Context Actions ====================

  async generateContext(): Promise<void> {
    await ContextActions.generateContext(this.deps);
  }

  async showContextStats(): Promise<void> {
    await ContextActions.showContextStats(this.deps);
  }

  // ==================== AI Actions ====================

  async sendToAI(): Promise<void> {
    await AiActions.sendToAI(this.deps);
  }

  // ==================== Toolbar Actions ====================

  async refreshCatalogs(): Promise<void> {
    await ToolbarActions.refreshCatalogs(this.deps);
  }

  async createStarter(): Promise<void> {
    await ToolbarActions.createStarter();
  }

  async openConfig(): Promise<void> {
    await ToolbarActions.openConfig();
  }

  async doctor(): Promise<void> {
    await ToolbarActions.doctor();
  }

  async resetCache(): Promise<void> {
    await ToolbarActions.resetCacheAction();
  }

  openSettings(): void {
    ToolbarActions.openSettings();
  }

  async updateAiModes(): Promise<void> {
    await ToolbarActions.updateAiModes(this.deps);
  }
}

// Singleton instance
let dispatcherInstance: ActionDispatcher | undefined;

/**
 * Initialize ActionDispatcher singleton.
 * Called once by ControlPanelView during setup.
 */
export function initActionDispatcher(deps: ActionDispatcherDeps): ActionDispatcher {
  dispatcherInstance = new ActionDispatcher(deps);
  return dispatcherInstance;
}

/**
 * Get ActionDispatcher singleton.
 * Must be initialized first via initActionDispatcher().
 */
export function getActionDispatcher(): ActionDispatcher {
  if (!dispatcherInstance) {
    throw new Error("ActionDispatcher not initialized");
  }
  return dispatcherInstance;
}

// Re-export individual action modules for direct use
export { ListingActions, ContextActions, AiActions, ToolbarActions };

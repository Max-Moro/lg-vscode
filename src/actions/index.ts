/**
 * Action Dispatcher - Central routing for all business actions
 *
 * Actions use getters from bootstrap directly, no deps injection needed.
 */

import * as ListingActions from "./ListingActions";
import * as ContextActions from "./ContextActions";
import * as AiActions from "./AiActions";
import * as ToolbarActions from "./ToolbarActions";

/**
 * Central dispatcher for all business actions.
 * Thin facade - delegates to action modules.
 */
export class ActionDispatcher {
  // ==================== Listing Actions ====================

  async generateListing(): Promise<void> {
    await ListingActions.generateListing();
  }

  async showIncluded(): Promise<void> {
    await ListingActions.showIncluded();
  }

  async showSectionStats(): Promise<void> {
    await ListingActions.showSectionStats();
  }

  // ==================== Context Actions ====================

  async generateContext(): Promise<void> {
    await ContextActions.generateContext();
  }

  async showContextStats(): Promise<void> {
    await ContextActions.showContextStats();
  }

  // ==================== AI Actions ====================

  async sendToAI(): Promise<void> {
    await AiActions.sendToAI();
  }

  // ==================== Toolbar Actions ====================

  async refreshCatalogs(): Promise<void> {
    await ToolbarActions.refreshCatalogs();
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
    await ToolbarActions.updateAiModes();
  }

  async clearState(): Promise<void> {
    await ToolbarActions.clearState();
  }
}

// Re-export individual action modules for direct use if needed
export { ListingActions, ContextActions, AiActions, ToolbarActions };

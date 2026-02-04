/**
 * Action Dispatcher - Central routing for all business actions
 *
 * Actions use getters from bootstrap directly, no deps injection needed.
 */

import * as GenerationActions from "./GenerationActions";
import * as StatsActions from "./StatsActions";
import * as AiActions from "./AiActions";
import * as ToolbarActions from "./ToolbarActions";

/**
 * Central dispatcher for all business actions.
 * Thin facade - delegates to action modules.
 */
export class ActionDispatcher {
  // ==================== Generation Actions ====================

  async generateListing(): Promise<void> {
    await GenerationActions.generateListing();
  }

  async generateContext(): Promise<void> {
    await GenerationActions.generateContext();
  }

  // ==================== Stats Actions ====================

  async showSectionStats(): Promise<void> {
    await StatsActions.showSectionStats();
  }

  async showContextStats(): Promise<void> {
    await StatsActions.showContextStats();
  }

  async showIncluded(): Promise<void> {
    await StatsActions.showIncluded();
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
export { GenerationActions, StatsActions, AiActions, ToolbarActions };

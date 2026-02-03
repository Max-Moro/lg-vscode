import { cliRender, cliReport } from "../cli/CliClient";
import { buildCliParams } from "../cli/ParamsBuilder";
import type { RunResult } from "../models/report";
import { getStore } from "../bootstrap";
import type { PCEStateStore } from "../state/store";

/**
 * Service for working with contexts.
 * Gets all parameters from PCEStateStore.
 */
export class ContextService {
  private get store(): PCEStateStore {
    return getStore();
  }

  constructor() {}
  
  /**
   * Generate context for current template from state
   * @throws {Error} if template is not selected
   */
  async generateContext(): Promise<string> {
    const state = this.store.getPersistentState();
    if (!state.template) {
      throw new Error("No template selected");
    }

    const target = `ctx:${state.template}`;
    const params = buildCliParams(this.store.getPersistentState(), { includeProvider: true });

    return cliRender(target, params);
  }
  
  /**
   * Get statistics for current context
   * @throws {Error} if template is not selected or CLI unavailable
   */
  async getStats(): Promise<RunResult> {
    const state = this.store.getPersistentState();
    if (!state.template) {
      throw new Error("No template selected");
    }

    const target = `ctx:${state.template}`;
    const params = buildCliParams(this.store.getPersistentState(), { includeProvider: true });

    const result = await cliReport(target, params);
    if (!result) {
      throw new Error("CLI unavailable");
    }
    return result;
  }

  /**
   * Get current context template name
   * @returns template name or empty string if not selected
   */
  getCurrentTemplate(): string {
    const state = this.store.getPersistentState();
    return state.template || "";
  }
}

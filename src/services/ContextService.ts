import * as vscode from "vscode";
import { cliRender, cliReport } from "../cli/CliClient";
import type { RunResult } from "../models/report";
import { ControlStateService } from "./ControlStateService";

/**
 * Service for working with contexts.
 * Gets all parameters from ControlStateService.
 */
export class ContextService {
  private stateService: ControlStateService;
  
  constructor(context: vscode.ExtensionContext) {
    this.stateService = ControlStateService.getInstance(context);
  }
  
  /**
   * Generate context for current template from state
   * @throws {Error} if template is not selected
   */
  async generateContext(): Promise<string> {
    const state = this.stateService.getState();
    if (!state.template) {
      throw new Error("No template selected");
    }
    
    const target = `ctx:${state.template}`;
    return cliRender(target, state);
  }
  
  /**
   * Get statistics for current context
   * @throws {Error} if template is not selected or CLI unavailable
   */
  async getStats(): Promise<RunResult> {
    const state = this.stateService.getState();
    if (!state.template) {
      throw new Error("No template selected");
    }

    const target = `ctx:${state.template}`;
    const result = await cliReport(target, state);
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
    const state = this.stateService.getState();
    return state.template || "";
  }
}

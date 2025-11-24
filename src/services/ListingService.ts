import * as vscode from "vscode";
import { cliRender, cliReport } from "../cli/CliClient";
import { ControlStateService } from "./ControlStateService";

/**
 * Service for working with section listings.
 * Gets all parameters from ControlStateService.
 */
export class ListingService {
  private stateService: ControlStateService;
  
  constructor(context: vscode.ExtensionContext) {
    this.stateService = ControlStateService.getInstance(context);
  }
  
  /**
   * Generate listing for current section from state
   * @throws {Error} if section is not selected
   */
  async generateListing(): Promise<string> {
    const state = this.stateService.getState();
    if (!state.section) {
      throw new Error("No section selected");
    }
    const target = `sec:${state.section}`;
    return cliRender(target, state);
  }
  
  /**
   * Get statistics for current section
   * @throws {Error} if section is not selected or CLI unavailable
   */
  async getStats(): Promise<import("../models/report").RunResult> {
    const state = this.stateService.getState();
    if (!state.section) {
      throw new Error("No section selected");
    }
    const target = `sec:${state.section}`;
    const result = await cliReport(target, state);
    if (!result) {
      throw new Error("CLI unavailable");
    }
    return result;
  }

  /**
   * Get list of files included in the current section
   * @throws {Error} if section is not selected or CLI unavailable
   */
  async getIncludedFiles(): Promise<{ path: string; sizeBytes: number }[]> {
    const state = this.stateService.getState();
    if (!state.section) {
      throw new Error("No section selected");
    }
    const target = `sec:${state.section}`;
    const data = await cliReport(target, state);
    if (!data) {
      throw new Error("CLI unavailable");
    }
    const files = Array.isArray(data.files) ? data.files : [];
    return files.map((f: { path: string; sizeBytes?: number }) => ({ path: f.path, sizeBytes: f.sizeBytes ?? 0 }));
  }
  
  /**
   * Get current section name
   * @returns section name or empty string if not selected
   */
  getCurrentSection(): string {
    const state = this.stateService.getState();
    return state.section || "";
  }
}

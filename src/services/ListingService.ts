import * as vscode from "vscode";
import { cliRender, cliReport, type CliGenerationParams } from "../cli/CliClient";
import { getPCEStore, type PCEStateStore } from "../state/store";

/**
 * Service for working with section listings.
 * Gets all parameters from PCEStateStore.
 */
export class ListingService {
  private store: PCEStateStore;

  constructor(context: vscode.ExtensionContext) {
    this.store = getPCEStore(context);
  }
  
  /**
   * Generate listing for current section from state
   * @throws {Error} if section is not selected
   */
  async generateListing(): Promise<string> {
    const state = this.store.getPersistentState();
    if (!state.section) {
      throw new Error("No section selected");
    }
    const target = `sec:${state.section}`;
    const ctx = state.template || "";
    const provider = state.providerId || "";

    const params: CliGenerationParams = {
      tokenizerLib: state.tokenizerLib || "tiktoken",
      encoder: state.encoder || "cl100k_base",
      ctxLimit: state.ctxLimit || 128000,
      modes: this.store.getCurrentModes(ctx, provider),
      tags: this.store.getCurrentTags(ctx),
      taskText: state.taskText,
      targetBranch: state.targetBranch,
    };

    return cliRender(target, params);
  }
  
  /**
   * Get statistics for current section
   * @throws {Error} if section is not selected or CLI unavailable
   */
  async getStats(): Promise<import("../models/report").RunResult> {
    const state = this.store.getPersistentState();
    if (!state.section) {
      throw new Error("No section selected");
    }
    const target = `sec:${state.section}`;
    const ctx = state.template || "";
    const provider = state.providerId || "";

    const params: CliGenerationParams = {
      tokenizerLib: state.tokenizerLib || "tiktoken",
      encoder: state.encoder || "cl100k_base",
      ctxLimit: state.ctxLimit || 128000,
      modes: this.store.getCurrentModes(ctx, provider),
      tags: this.store.getCurrentTags(ctx),
      taskText: state.taskText,
      targetBranch: state.targetBranch,
    };

    const result = await cliReport(target, params);
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
    const state = this.store.getPersistentState();
    if (!state.section) {
      throw new Error("No section selected");
    }
    const target = `sec:${state.section}`;
    const ctx = state.template || "";
    const provider = state.providerId || "";

    const params: CliGenerationParams = {
      tokenizerLib: state.tokenizerLib || "tiktoken",
      encoder: state.encoder || "cl100k_base",
      ctxLimit: state.ctxLimit || 128000,
      modes: this.store.getCurrentModes(ctx, provider),
      tags: this.store.getCurrentTags(ctx),
      taskText: state.taskText,
      targetBranch: state.targetBranch,
    };

    const data = await cliReport(target, params);
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
    const state = this.store.getPersistentState();
    return state.section || "";
  }
}

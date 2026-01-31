import * as vscode from "vscode";
import { cliRender, cliReport, type CliGenerationParams } from "../cli/CliClient";
import type { RunResult } from "../models/report";
import { getPCEStore, type PCEStateStore } from "../state/store";

/**
 * Service for working with contexts.
 * Gets all parameters from PCEStateStore.
 */
export class ContextService {
  private store: PCEStateStore;

  constructor(context: vscode.ExtensionContext) {
    this.store = getPCEStore(context);
  }
  
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
   * Get statistics for current context
   * @throws {Error} if template is not selected or CLI unavailable
   */
  async getStats(): Promise<RunResult> {
    const state = this.store.getPersistentState();
    if (!state.template) {
      throw new Error("No template selected");
    }

    const target = `ctx:${state.template}`;
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
   * Get current context template name
   * @returns template name or empty string if not selected
   */
  getCurrentTemplate(): string {
    const state = this.store.getPersistentState();
    return state.template || "";
  }
}

/**
 * AI-related business actions
 */

import * as vscode from "vscode";
import type { PCEStateStore } from "../state/store";
import type { ContextService } from "../services/ContextService";
import type { AiIntegrationService } from "../services/ai/AiIntegrationService";

export interface AiActionsDeps {
  store: PCEStateStore;
  contextService: ContextService;
  aiService: AiIntegrationService;
}

/**
 * Send context to AI provider
 */
export async function sendToAI(deps: AiActionsDeps): Promise<void> {
  const { store, contextService, aiService } = deps;
  const state = store.getPersistentState();
  const providerId = state.providerId;
  const template = state.template;

  if (!providerId) {
    vscode.window.showWarningMessage("No AI provider selected.");
    return;
  }

  if (!template) {
    vscode.window.showWarningMessage("Select a context first. Section listings cannot be sent to AI.");
    return;
  }

  try {
    const runs = store.getIntegrationModeRuns(template, providerId);

    if (runs === null && providerId !== "clipboard") {
      vscode.window.showErrorMessage(
        "No integration mode configured for this context and provider.\n" +
        "Run 'Update AI Modes Template' from the toolbar to generate ai-interaction.sec.yaml."
      );
      return;
    }

    await aiService.generateAndSend(
      () => contextService.generateContext(),
      providerId,
      runs ?? "",
      `Generating context '${template}'...`
    );
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    vscode.window.showErrorMessage(`Failed to send to AI: ${errorMessage}`);
  }
}

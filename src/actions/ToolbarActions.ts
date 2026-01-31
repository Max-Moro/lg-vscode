/**
 * Toolbar menu actions
 */

import * as vscode from "vscode";
import type { StateCoordinator } from "../state/coordinator";
import type { AiIntegrationService } from "../services/ai/AiIntegrationService";
import { resetCache, runDoctor } from "../services/DoctorService";
import { openConfigOrInit, runInitWizard } from "../starter/StarterConfig";
import { EXT_ID } from "../constants";
import { logError } from "../logging/log";

export interface ToolbarActionsDeps {
  coordinator: StateCoordinator;
  aiService: AiIntegrationService;
}

/**
 * Refresh catalogs
 */
export async function refreshCatalogs(deps: ToolbarActionsDeps): Promise<void> {
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "LG: Refreshing catalogs…", cancellable: false },
    async () => {
      await deps.coordinator.dispatch({ type: "REFRESH" });
      await deps.coordinator.waitForStability();
    }
  );
  vscode.window.showInformationMessage("LG catalogs refreshed successfully");
}

/**
 * Create starter config
 */
export async function createStarter(): Promise<void> {
  await runInitWizard();
}

/**
 * Open config file
 */
export async function openConfig(): Promise<void> {
  await openConfigOrInit();
}

/**
 * Run doctor diagnostics
 */
export async function doctor(): Promise<void> {
  await runDoctor();
}

/**
 * Reset CLI cache
 */
export async function resetCacheAction(): Promise<void> {
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "LG: Resetting cache…", cancellable: false },
    () => resetCache()
  );
  vscode.window.showInformationMessage("LG cache has been reset.");
}

/**
 * Open extension settings
 */
export function openSettings(): void {
  vscode.commands.executeCommand("workbench.action.openSettings", `@ext:${EXT_ID}`);
}

/**
 * Update AI modes template
 */
export async function updateAiModes(deps: ToolbarActionsDeps): Promise<void> {
  const { AiModesTemplateGenerator } = await import("../services/ai/AiModesTemplateGenerator");
  const generator = new AiModesTemplateGenerator(deps.aiService);

  try {
    const filePath = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "LG: Updating AI modes template...",
        cancellable: false
      },
      () => generator.generate()
    );

    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc);

    vscode.window.showInformationMessage("AI modes template updated successfully");
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    logError(`[updateAiModes] ${errorMessage}`, e);
    vscode.window.showErrorMessage(`Failed to update AI modes template: ${errorMessage}`);
  }
}

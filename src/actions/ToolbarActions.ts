/**
 * Toolbar menu actions
 */

import * as vscode from "vscode";
import { getCoordinator, getAiService, getStore } from "../bootstrap";
import { resetCache, runDoctor } from "../services/DoctorService";
import { runInitWizard } from "../starter/StarterConfig";
import { EXT_ID } from "../constants";
import { logError } from "../logging/log";
import { Refresh, Initialize } from "../state-lg/domains/lifecycle";

/**
 * Refresh catalogs
 */
export async function refreshCatalogs(): Promise<void> {
  const coordinator = getCoordinator();

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "LG: Refreshing catalogs…", cancellable: false },
    async () => {
      await coordinator.dispatch(Refresh.create());
      await coordinator.waitForStability();
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
export async function updateAiModes(): Promise<void> {
  const aiService = getAiService();
  const { AiModesTemplateGenerator } = await import("../ai/AiModesTemplateGenerator");
  const generator = new AiModesTemplateGenerator(aiService);

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

/**
 * Reset UI to default values.
 * Clears all saved selections (provider, context, modes, tags, tokenization settings)
 * and re-initializes the Control Panel with defaults.
 */
export async function clearState(): Promise<void> {
  const store = getStore();
  const coordinator = getCoordinator();

  const confirmed = await vscode.window.showWarningMessage(
    "This will reset all Control Panel settings to defaults (provider, context, modes, tags, tokenization). Continue?",
    { modal: true },
    "Reset"
  );

  if (confirmed !== "Reset") {
    return;
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "LG: Resetting to defaults…", cancellable: false },
    async () => {
      await store.clearAll();
      await coordinator.dispatch(Initialize.create());
      await coordinator.waitForStability();
    }
  );

  vscode.window.showInformationMessage("Control Panel has been reset to defaults.");
}

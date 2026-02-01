/**
 * Context-related business actions
 */

import * as vscode from "vscode";
import { getStore, getContextService, getVdocs } from "../bootstrap";
import { showStatsWebview } from "../views/StatsWebview";

/**
 * Generate context and open in virtual document
 */
export async function generateContext(): Promise<void> {
  const store = getStore();
  const contextService = getContextService();
  const vdocs = getVdocs();

  const state = store.getPersistentState();
  const template = state.template;

  if (!template) {
    vscode.window.showWarningMessage("Select a template first.");
    return;
  }

  const content = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `LG: Generating context '${template}'…`, cancellable: false },
    () => contextService.generateContext()
  );
  await vdocs.open("context", `Context — ${template}.md`, content);
}

/**
 * Show stats for context
 */
export async function showContextStats(): Promise<void> {
  const store = getStore();
  const contextService = getContextService();

  const state = store.getPersistentState();
  const template = state.template;

  if (!template) {
    vscode.window.showWarningMessage("Select a template first.");
    return;
  }

  const data = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "LG: Computing stats for context…", cancellable: false },
    () => contextService.getStats()
  );

  await showStatsWebview(data, () => contextService.getStats());
}

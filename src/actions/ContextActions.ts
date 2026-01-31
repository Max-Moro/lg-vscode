/**
 * Context-related business actions
 */

import * as vscode from "vscode";
import type { PCEStateStore } from "../state/store";
import type { ContextService } from "../services/ContextService";
import type { VirtualDocProvider } from "../views/VirtualDocProvider";
import type { RunResult } from "../models/report";

export interface ContextActionsDeps {
  store: PCEStateStore;
  contextService: ContextService;
  vdocs: VirtualDocProvider;
  showStats: (data: RunResult, refreshFn: () => Promise<RunResult>) => Promise<void>;
}

/**
 * Generate context and open in virtual document
 */
export async function generateContext(deps: ContextActionsDeps): Promise<void> {
  const { store, contextService, vdocs } = deps;
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
export async function showContextStats(deps: ContextActionsDeps): Promise<void> {
  const { store, contextService, showStats } = deps;
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

  await showStats(
    data,
    () => contextService.getStats()
  );
}

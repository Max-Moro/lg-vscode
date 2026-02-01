/**
 * Listing-related business actions
 */

import * as vscode from "vscode";
import { getStore, getListingService, getVdocs, getIncludedTree } from "../bootstrap";
import { showStatsWebview } from "../views/StatsWebview";

/**
 * Generate listing and open in virtual document
 */
export async function generateListing(): Promise<void> {
  const store = getStore();
  const listingService = getListingService();
  const vdocs = getVdocs();

  const state = store.getPersistentState();
  const section = state.section;

  if (!section) {
    vscode.window.showWarningMessage("Select a section first.");
    return;
  }

  const content = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `LG: Generating listing '${section}'…`, cancellable: false },
    () => listingService.generateListing()
  );
  await vdocs.open("listing", `Listing — ${section}.md`, content);
}

/**
 * Show included files in tree view
 */
export async function showIncluded(): Promise<void> {
  const store = getStore();
  const listingService = getListingService();
  const included = getIncludedTree();

  const state = store.getPersistentState();
  const section = state.section;

  if (!section) {
    vscode.window.showWarningMessage("Select a section first.");
    return;
  }

  const files = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "LG: Collecting included paths…", cancellable: false },
    () => listingService.getIncludedFiles()
  );
  included.setPaths(files.map(f => f.path));
  await vscode.commands.executeCommand("lg.included.focus");
}

/**
 * Show stats for section
 */
export async function showSectionStats(): Promise<void> {
  const store = getStore();
  const listingService = getListingService();

  const state = store.getPersistentState();
  const section = state.section;

  if (!section) {
    vscode.window.showWarningMessage("Select a section first.");
    return;
  }

  const data = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "LG: Computing stats…", cancellable: false },
    () => listingService.getStats()
  );

  await showStatsWebview(data, () => listingService.getStats());
}

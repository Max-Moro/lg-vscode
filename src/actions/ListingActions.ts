/**
 * Listing-related business actions
 */

import * as vscode from "vscode";
import type { PCEStateStore } from "../state/store";
import type { ListingService } from "../services/ListingService";
import type { VirtualDocProvider } from "../views/VirtualDocProvider";
import type { IncludedTree } from "../views/IncludedTree";
import type { RunResult } from "../models/report";

export interface ListingActionsDeps {
  store: PCEStateStore;
  listingService: ListingService;
  vdocs: VirtualDocProvider;
  included: IncludedTree;
  showStats: (data: RunResult, refreshFn: () => Promise<RunResult>) => Promise<void>;
}

/**
 * Generate listing and open in virtual document
 */
export async function generateListing(deps: ListingActionsDeps): Promise<void> {
  const { store, listingService, vdocs } = deps;
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
export async function showIncluded(deps: ListingActionsDeps): Promise<void> {
  const { store, listingService, included } = deps;
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
export async function showSectionStats(deps: ListingActionsDeps): Promise<void> {
  const { store, listingService, showStats } = deps;
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

  await showStats(
    data,
    () => listingService.getStats()
  );
}

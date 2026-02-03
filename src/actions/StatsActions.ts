/**
 * Stats-related business actions (sections and contexts)
 */

import * as vscode from "vscode";
import { getStore, getStatsService, getIncludedTree } from "../bootstrap";
import { showStatsWebview } from "../views/StatsWebview";
import type { PersistentState } from "../state/types";

type TargetType = "section" | "context";

interface TargetInfo {
  target: string;
  name: string;
}

function resolveTarget(type: TargetType, state: PersistentState): TargetInfo | null {
  if (type === "section") {
    if (!state.section) return null;
    return { target: `sec:${state.section}`, name: state.section };
  }
  if (!state.template) return null;
  return { target: `ctx:${state.template}`, name: state.template };
}

async function showStats(type: TargetType): Promise<void> {
  const state = getStore().getPersistentState();
  const info = resolveTarget(type, state);

  if (!info) {
    vscode.window.showWarningMessage(`Select a ${type === "section" ? "section" : "template"} first.`);
    return;
  }

  const statsService = getStatsService();
  const data = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `LG: Computing stats for ${type}…`, cancellable: false },
    () => statsService.getStats(info.target)
  );

  await showStatsWebview(data, () => statsService.getStats(info.target));
}

export const showSectionStats = (): Promise<void> => showStats("section");
export const showContextStats = (): Promise<void> => showStats("context");

/**
 * Show included files in tree view (sections only)
 */
export async function showIncluded(): Promise<void> {
  const state = getStore().getPersistentState();
  const info = resolveTarget("section", state);

  if (!info) {
    vscode.window.showWarningMessage("Select a section first.");
    return;
  }

  const data = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "LG: Collecting included paths…", cancellable: false },
    () => getStatsService().getStats(info.target)
  );

  const files = Array.isArray(data.files) ? data.files : [];
  getIncludedTree().setPaths(files.map((f: { path: string }) => f.path));
  await vscode.commands.executeCommand("lg.included.focus");
}

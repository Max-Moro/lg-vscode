/**
 * Generation-related business actions (listings and contexts)
 */

import * as vscode from "vscode";
import { getStore, getGenerationService, getVdocs } from "../bootstrap";
import type { PersistentState } from "../state/types";

type TargetType = "section" | "context";

interface TargetInfo {
  target: string;
  name: string;
  docType: "listing" | "context";
}

function resolveTarget(type: TargetType, state: PersistentState): TargetInfo | null {
  if (type === "section") {
    if (!state.section) return null;
    return { target: `sec:${state.section}`, name: state.section, docType: "listing" };
  }
  if (!state.template) return null;
  return { target: `ctx:${state.template}`, name: state.template, docType: "context" };
}

async function generate(type: TargetType): Promise<void> {
  const state = getStore().getPersistentState();
  const info = resolveTarget(type, state);

  if (!info) {
    vscode.window.showWarningMessage(`Select a ${type === "section" ? "section" : "template"} first.`);
    return;
  }

  const content = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `LG: Generating ${info.docType} '${info.name}'…`, cancellable: false },
    () => getGenerationService().generate(info.target)
  );

  await getVdocs().open(info.docType, `${info.docType === "listing" ? "Listing" : "Context"} — ${info.name}.md`, content);
}

export const generateListing = (): Promise<void> => generate("section");
export const generateContext = (): Promise<void> => generate("context");

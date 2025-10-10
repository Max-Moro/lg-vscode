/**
 * Doctor — через Webview с интерактивным UI.
 */
import * as vscode from "vscode";
import { showDoctorWebview } from "../views/DoctorWebview";
import { runDoctorJson } from "../services/DoctorService";
import type { DiagReport } from "../models/diag_report";

export async function runDoctor() {
  const wf = vscode.workspace.workspaceFolders?.[0];
  if (!wf) {
    vscode.window.showErrorMessage("Open a folder to run LG Doctor.");
    return;
  }
  try {
    const data: DiagReport = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "LG: Running Doctor…", cancellable: false },
      async () => runDoctorJson()
    );
    await showDoctorWebview(data);
  } catch (e: any) {
    vscode.window.showErrorMessage(`LG Doctor failed: ${e?.message || e}`);
  }
}
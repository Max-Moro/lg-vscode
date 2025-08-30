/**
 * Doctor — теперь через Webview с интерактивным UI.
 */
import * as vscode from "vscode";
import { runDoctorJson } from "../runner/LgLocator";
import { showDoctorWebview } from "../views/DoctorWebview";

export async function runDoctor(_ctx: vscode.ExtensionContext) {
  const wf = vscode.workspace.workspaceFolders?.[0];
  if (!wf) {
    vscode.window.showErrorMessage("Open a folder to run LG Doctor.");
    return;
  }
  try {
    const data = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "LG: Running Doctor…", cancellable: false },
      async () => runDoctorJson()
    );
    await showDoctorWebview(data);
  } catch (e: any) {
    vscode.window.showErrorMessage(`LG Doctor failed: ${e?.message || e}`);
  }
}
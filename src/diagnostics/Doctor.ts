/**
 * "Doctor" — быстрые проверки среды.
 * Сейчас: проверяем workspace + наличие lg-cfg/, даем подсказки.
 * Позже: версию схемы, наличие Python/tiktoken, git и т. п.
 */
import * as vscode from "vscode";

export async function runDoctor(ctx: vscode.ExtensionContext) {
  const wf = vscode.workspace.workspaceFolders?.[0];
  if (!wf) {
    vscode.window.showErrorMessage("Open a folder to run LG Doctor.");
    return;
  }
  if (!vscode.workspace.isTrusted) {
    vscode.window.showWarningMessage("Workspace is not trusted. Some features may be disabled.");
  }
  const cfg = await vscode.workspace.fs.stat(vscode.Uri.joinPath(wf.uri, "lg-cfg", "config.yaml")).then(
    () => true,
    () => false
  );
  if (!cfg) {
    vscode.window.showInformationMessage("lg-cfg/config.yaml not found. Use 'LG: Create Starter Config'.");
  } else {
    vscode.window.showInformationMessage("LG Doctor: OK — config detected.");
  }
}

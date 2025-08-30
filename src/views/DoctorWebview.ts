import * as vscode from "vscode";
import * as fs from "fs";
import { runDoctorJson, runDoctorBundle } from "../runner/LgLocator";

export async function showDoctorWebview(report: any) {
  const panel = vscode.window.createWebviewPanel(
    "lg.doctor",
    "Listing Generator — Doctor",
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(getExtensionUri(), "media")],
    }
  );

  const extUri = getExtensionUri();
  const media = (p: string) => vscode.Uri.joinPath(extUri, "media", p);
  const cssUri = panel.webview.asWebviewUri(media("doctor.css")).toString();
  const jsUri = panel.webview.asWebviewUri(media("doctor.js")).toString();
  const htmlTplPath = vscode.Uri.joinPath(extUri, "media", "doctor.html");
  const cspSource = panel.webview.cspSource;
  const nonce = makeNonce();

  const rawHtml = fs.readFileSync(htmlTplPath.fsPath, "utf8");
  panel.webview.html = rawHtml
    .replace(/{{cspSource}}/g, cspSource)
    .replace(/{{cssUri}}/g, cssUri)
    .replace(/{{jsUri}}/g, jsUri)
    .replace(/{{nonce}}/g, String(nonce));

  panel.webview.onDidReceiveMessage(async (msg) => {
    try {
      switch (msg?.type) {
        case "ready":
          panel.webview.postMessage({ type: "report", payload: report });
          break;
        case "refresh":
          {
            const data = await runDoctorJson();
            panel.webview.postMessage({ type: "report", payload: data });
          }
          break;
        case "rebuildCache":
          await vscode.commands.executeCommand("lg.resetCache");
          {
            const data = await runDoctorJson();
            panel.webview.postMessage({ type: "report", payload: data });
          }
          break;
        case "buildBundle":
          {
            const { data, bundlePath } = await runDoctorBundle();
            if (bundlePath) {
              vscode.window.showInformationMessage(`Diagnostic bundle written to: ${bundlePath}`);
            } else {
              vscode.window.showWarningMessage("Bundle built, but path could not be detected (see Output).");
            }
            panel.webview.postMessage({ type: "report", payload: data, bundlePath });
          }
          break;
        case "openSettings":
          vscode.commands.executeCommand("workbench.action.openSettings", "@ext:your-org.vscode-lg");
          break;
        case "openLgCfg":
          vscode.commands.executeCommand("lg.openConfig");
          break;
      }
    } catch (e: any) {
      vscode.window.showErrorMessage(`LG Doctor: ${e?.message || e}`);
    }
  });
}

function getExtensionUri(): vscode.Uri {
  const ext = vscode.extensions.getExtension("your-org.vscode-lg");
  if (!ext) {
    throw new Error("Cannot resolve extension URI (your-org.vscode-lg).");
  }
  return ext.extensionUri;
}

function makeNonce() {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}

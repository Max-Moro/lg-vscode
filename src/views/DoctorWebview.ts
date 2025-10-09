import * as vscode from "vscode";
import { runDoctorBundle, runDoctorJson } from "../services/DoctorService";
import { buildHtml, getExtensionUri, mediaUri, lgUiUri } from "../webview/webviewKit";
import type { DiagReport } from "../models/diag_report";

export async function showDoctorWebview(report: DiagReport) {
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

  // локальные ресурсы из media/
  panel.webview.html = buildHtml(panel.webview, "doctor.html", {
    baseCssUri:  mediaUri(panel.webview, "base.css"),
    cssUri:      mediaUri(panel.webview, "doctor.css"),
    lgUiCssUri:  lgUiUri(panel.webview, "lg-ui.css"),
    lgUiJsUri:   lgUiUri(panel.webview, "lg-ui.js"),
    jsUri:       mediaUri(panel.webview, "doctor.js"),
    commonJsUri: mediaUri(panel.webview, "common.js"),
  });

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
          {
            const data = await runDoctorJson({ rebuild: true });
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
        case "copyJson":
          {
            const text =
              typeof msg.text === "string" && msg.text.length
                ? msg.text
                : JSON.stringify(await runDoctorJson(), null, 2);
            await vscode.env.clipboard.writeText(text);
            vscode.window.showInformationMessage("Doctor JSON copied to clipboard.");
          }
          break;
      }
    } catch (e: any) {
      vscode.window.showErrorMessage(`LG Doctor: ${e?.message || e}`);
    }
  });
}

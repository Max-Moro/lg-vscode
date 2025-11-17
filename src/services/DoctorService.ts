import * as vscode from "vscode";
import { cliDiag } from "../cli/CliClient";
import { runCli, runCliResult } from "../cli/CliResolver";
import type { DiagReport } from "../models/diag_report";

/** JSON diagnostics (without bundle) */
export async function runDoctorJson(opts?: { rebuild?: boolean }): Promise<DiagReport> {
  return cliDiag(opts?.rebuild);
}

/** Diagnostics with bundle building — needs stderr, so separate process call here. */
export async function runDoctorBundle(): Promise<{ data: DiagReport; bundlePath?: string }> {
  // Use common resolver that can return stdout+stderr
  const { stdout, stderr } = await runCliResult(["diag", "--bundle"], { timeoutMs: 60_000 });
  let data: DiagReport;
  try {
    data = JSON.parse(stdout || "{}") as DiagReport;
  } catch (e) {
    // If JSON is broken, wrap error with helpful stderr
    throw new Error(`LG Doctor: unexpected CLI output (not JSON). STDERR:\n${stderr || "(empty)"}`);
  }
  // Path to zip is printed in stderr; parse by familiar string
  const re = /Diagnostic bundle written to:\s*(.+)\s*$/m;
  const m = re.exec(stderr || "");
  const bundlePath = m ? m[1].trim() : undefined;
  return { data, bundlePath };
}

/** Reset LG cache via CLI. */
export async function resetCache(): Promise<void> {
  await runCli(["diag", "--rebuild-cache"], { timeoutMs: 60_000 });
}

/**
 * Run Doctor with interactive UI through Webview.
 */
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

    // Dynamic import to avoid circular dependencies
    const { showDoctorWebview } = await import("../views/DoctorWebview");
    await showDoctorWebview(data);
  } catch (e: any) {
    vscode.window.showErrorMessage(`LG Doctor failed: ${e?.message || e}`);
  }
}

import * as vscode from "vscode";
import { cliDiag } from "../cli/CliClient";
import { runCli, runCliResult } from "../cli/CliResolver";
import type { DiagReport } from "../models/diag_report";

/** JSON-диагностика (без bundle) */
export async function runDoctorJson(opts?: { rebuild?: boolean }): Promise<DiagReport> {
  return cliDiag(opts?.rebuild);
}

/** Диагностика с построением бандла — нужен stderr, поэтому здесь отдельный вызов процесса. */
export async function runDoctorBundle(): Promise<{ data: DiagReport; bundlePath?: string }> {
  // Используем общий резолвер, который умеет возвращать stdout+stderr
  const { stdout, stderr } = await runCliResult(["diag", "--bundle"], { timeoutMs: 60_000 });
  let data: DiagReport;
  try {
    data = JSON.parse(stdout || "{}") as DiagReport;
  } catch (e) {
    // если JSON сломан, обернём ошибку с полезным stderr
    throw new Error(`LG Doctor: unexpected CLI output (not JSON). STDERR:\n${stderr || "(empty)"}`);
  }
  // Путь к zip печатается в stderr; спарсим по знакомой строке.
  const re = /Diagnostic bundle written to:\s*(.+)\s*$/m;
  const m = re.exec(stderr || "");
  const bundlePath = m ? m[1].trim() : undefined;
  return { data, bundlePath };
}

/** Сброс кэша LG через CLI. */
export async function resetCache(): Promise<void> {
  await runCli(["diag", "--rebuild-cache"], { timeoutMs: 60_000 });
}

/**
 * Запустить Doctor с интерактивным UI через Webview.
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
    
    // Динамический импорт для избежания циклических зависимостей
    const { showDoctorWebview } = await import("../views/DoctorWebview");
    await showDoctorWebview(data);
  } catch (e: any) {
    vscode.window.showErrorMessage(`LG Doctor failed: ${e?.message || e}`);
  }
}

/**
 * CLI resolver - управление запуском Listing Generator CLI.
 * 
 * Этот модуль отвечает за:
 * 1. Определение способа запуска CLI (managed venv, system Python, explicit path)
 * 2. Унифицированный запуск CLI команд с логированием и обработкой ошибок
 * 3. Определение workspace root для контекста выполнения
 */
import * as vscode from "vscode";
import { spawn } from "../runner/LgProcess";
import { ensureManagedCli, resolveManagedCliBin } from "../runner/LgInstaller";
import { findPython } from "../runner/PythonFind";
import { logDebug, logError, withDuration } from "../logging/log";

export type RunSpec = { cmd: string; args: string[] };

let _ctx: vscode.ExtensionContext | undefined;
export function setExtensionContext(ctx: vscode.ExtensionContext) {
  _ctx = ctx;
}

/** Единое правило выбора корня: родитель lg-cfg, иначе первый корень. */
export function effectiveWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return undefined;

  const cfgRoot = folders.find((f) => {
    const base = require("path").basename(f.uri.fsPath).toLowerCase();
    return base === "lg-cfg";
  });
  if (cfgRoot) return require("path").dirname(cfgRoot.uri.fsPath);

  return folders[0]?.uri.fsPath;
}

async function resolveCliRunSpec(): Promise<RunSpec | undefined> {
  const cfg = vscode.workspace.getConfiguration();
  const explicit = cfg.get<string>("lg.cli.path")?.trim();
  if (explicit) return { cmd: explicit, args: [] };

  const strategy = (cfg.get<string>("lg.install.strategy") || "managedVenv") as
    | "managedVenv"
    | "pipx"
    | "system";

  if (strategy === "system") {
    const interp = cfg.get<string>("lg.python.interpreter")?.trim();
    if (interp) return { cmd: interp, args: ["-m", "lg.cli"] };
  }

  if (strategy === "managedVenv") {
    if (!_ctx) throw new Error("Extension context is not initialized");
    await ensureManagedCli(_ctx);
    const bin = await resolveManagedCliBin(_ctx);
    if (bin) return { cmd: bin, args: [] };
  }

  try {
    await spawn(process.platform === "win32" ? "where" : "which", ["listing-generator"], { timeoutMs: 4000, captureStderr: false });
    return { cmd: "listing-generator", args: [] };
  } catch { /* ignore */ }

  const py = await findPython();
  if (py) return { cmd: py, args: ["-m", "lg.cli"] };

  return undefined;
}

/**
 * Внутренняя унифицированная функция запуска CLI.
 * 
 * @param cliArgs - аргументы CLI команды
 * @param opts - опции запуска
 * @returns SpawnResult с stdout и опциональным stderr
 */
async function runCliInternal(
  cliArgs: string[],
  opts: { timeoutMs?: number; stdinData?: string; captureStderr?: boolean } = {}
) {
  const spec = await resolveCliRunSpec();
  if (!spec) throw new Error("CLI is not available. Configure `lg.python.interpreter` or `lg.cli.path`, or use managed venv.");
  
  const args = [...spec.args, ...cliArgs];
  const cwd = effectiveWorkspaceRoot();
  
  // Формируем отображаемую команду для логирования
  const stdinLabel = opts.stdinData !== undefined ? ' (with stdin)' : '';
  const cmdDisplay = `${spec.cmd} ${args.join(" ")}${stdinLabel}`;
  
  logDebug(`[CLI] ${cmdDisplay}`);
  
  return withDuration(`[CLI] ${cliArgs.join(" ")}`, async () => {
    try {
      const result = await spawn(spec.cmd, args, { 
        cwd, 
        timeoutMs: opts.timeoutMs ?? 120_000,
        stdinData: opts.stdinData,
        captureStderr: opts.captureStderr
      });
      
      logDebug(`[CLI] stdout bytes: ${result.stdout?.length ?? 0}`);
      
      // Полезно видеть stderr даже при коде 0 (некоторые утилиты пишут варнинги)
      if (result.stderr?.trim()) {
        logDebug("[CLI] stderr (non-empty): " + result.stderr.trim().slice(0, 4000));
      }
      
      return result;
    } catch (e: any) {
      logError(`[CLI] ${cliArgs.join(" ")} — failed`, e);
      throw e;
    }
  });
}

/**
 * Унифицированный запуск CLI. Возвращает только stdout.
 */
export async function runCli(cliArgs: string[], opts: { timeoutMs?: number; stdinData?: string } = {}): Promise<string> {
  const result = await runCliInternal(cliArgs, { ...opts, captureStderr: false });
  return result.stdout;
}

/**
 * Запуск CLI с возвратом stdout+stderr (нужно для diag --bundle).
 */
export async function runCliResult(
  cliArgs: string[],
  opts: { timeoutMs?: number; stdinData?: string } = {}
): Promise<{ stdout: string; stderr: string }> {
  const result = await runCliInternal(cliArgs, { ...opts, captureStderr: true });
  return { stdout: result.stdout, stderr: result.stderr ?? "" };
}

/** Быстрая проверка наличия CLI, с предложением автоустановки. */
export async function locateCliOrOfferInstall(ctx: vscode.ExtensionContext): Promise<string | undefined> {
  setExtensionContext(ctx);
  const spec = await resolveCliRunSpec();
  if (spec) return spec.cmd;

  const choice = await vscode.window.showInformationMessage(
    "Listing Generator CLI не найден. Установить автоматически в изолированный venv?",
    "Установить",
    "Позже"
  );
  if (choice === "Установить") {
    await ensureManagedCli(ctx);
    const again = await resolveCliRunSpec();
    return again?.cmd;
  }
  return undefined;
}

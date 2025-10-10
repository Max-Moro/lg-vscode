import * as vscode from "vscode";
import { spawnToString, spawnToResult } from "../runner/LgProcess";
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
    await spawnToString(process.platform === "win32" ? "where" : "which", ["listing-generator"], { timeoutMs: 4000 });
    return { cmd: "listing-generator", args: [] };
  } catch { /* ignore */ }

  const py = await findPython();
  if (py) return { cmd: py, args: ["-m", "lg.cli"] };

  return undefined;
}

/** Унифицированный запуск CLI. Возвращает stdout. */
export async function runCli(cliArgs: string[], opts: { timeoutMs?: number; stdinData?: string } = {}): Promise<string> {
  const spec = await resolveCliRunSpec();
  if (!spec) throw new Error("CLI is not available. Configure `lg.python.interpreter` or `lg.cli.path`, or use managed venv.");
  const args = [...spec.args, ...cliArgs];
  const cwd = effectiveWorkspaceRoot();
  const cmdDisplay = opts.stdinData !== undefined 
    ? `${spec.cmd} ${args.join(" ")} (with stdin)`
    : `${spec.cmd} ${args.join(" ")}`;
  logDebug(`[CLI] ${cmdDisplay}`);
  return withDuration(`[CLI] ${cliArgs.join(" ")}`, async () => {
    try {
      const out = await spawnToString(spec.cmd, args, { 
        cwd, 
        timeoutMs: opts.timeoutMs ?? 120_000,
        stdinData: opts.stdinData
      });
      logDebug(`[CLI] stdout bytes: ${out?.length ?? 0}`);
      return out;
    } catch (e: any) {
      const stderr = String(e?.message || e || "");
      const brief = briefFromStderr(stderr);
      logError(`[CLI] ${cliArgs.join(" ")} — failed: ${brief}`, e);
      throw e;
    }
  });
}

/** Запуск CLI с возвратом stdout+stderr (нужно для diag --bundle). */
export async function runCliResult(
  cliArgs: string[],
  opts: { timeoutMs?: number; stdinData?: string } = {}
): Promise<{ stdout: string; stderr: string }> {
  const spec = await resolveCliRunSpec();
  if (!spec) throw new Error("CLI is not available. Configure `lg.python.interpreter` or `lg.cli.path`, or use managed venv.");
  const args = [...spec.args, ...cliArgs];
  const cwd = effectiveWorkspaceRoot();
  const cmdDisplay = opts.stdinData !== undefined 
    ? `${spec.cmd} ${args.join(" ")} (result, with stdin)`
    : `${spec.cmd} ${args.join(" ")} (result)`;
  logDebug(`[CLI] ${cmdDisplay}`);
  return withDuration(`[CLI] ${cliArgs.join(" ")} (result)`, async () => {
    try {
      const res = await spawnToResult(spec.cmd, args, { 
        cwd, 
        timeoutMs: opts.timeoutMs ?? 120_000,
        stdinData: opts.stdinData
      });
      // полезно видеть stderr даже при коде 0 (некоторые утилиты пишут варнинги)
      if (res.stderr?.trim()) logDebug("[CLI] stderr (non-empty): " + res.stderr.trim().slice(0, 4000));
      return res;
    } catch (e: any) {
      const stderr = String(e?.message || e || "");
      const brief = briefFromStderr(stderr);
      logError(`[CLI] ${cliArgs.join(" ")} (result) — failed: ${brief}`, e);
      throw e;
    }
  });
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

function stripAnsi(s: string): string {
  return s.replace(/\x1B\[[0-9;]*[A-Za-z]/g, "");
}
function briefFromStderr(stderr: string): string {
  const text = stripAnsi(String(stderr || "")).trim();
  if (!text) return "(no stderr)";
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return "(no stderr)";
  const hasTrace = lines.some(l => /^Traceback\b/.test(l));
  if (hasTrace) {
    // В пайтоновском трейсбэке последний осмысленный рядок — "<Type>Error: message"
    const errLine = [...lines].reverse().find(l => /\b(Error|Exception|SyntaxError|SystemExit)\b/.test(l));
    return errLine || lines[lines.length - 1];
  }
  return lines[0];
}

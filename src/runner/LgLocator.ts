/**
 * Локатор CLI + высокоуровневые раннеры для запуска listing-generator.
 * Здесь:
 *  - учитываем настройки (явный путь к CLI, стратегия установки, интерпретатор);
 *  - управляемый venv внутри globalStorage;
 *  - fallback на системный CLI / python -m lg.cli;
 *  - удобные функции: runListing / runListIncluded / runContext.
 */
import * as vscode from "vscode";
import { spawnToString } from "./LgProcess";
import { ensureManagedCli, resolveManagedCliBin } from "./LgInstaller";
import { findPython } from "./PythonFind";

let _ctx: vscode.ExtensionContext | undefined;
export function setExtensionContext(ctx: vscode.ExtensionContext) {
  _ctx = ctx;
}

export type RunSpec = { cmd: string; args: string[] };

async function resolveCliRunSpec(): Promise<RunSpec | undefined> {
  const cfg = vscode.workspace.getConfiguration();
  const explicit = cfg.get<string>("lg.cli.path")?.trim();
  if (explicit) {
    // Явный путь к бинарю CLI
    return { cmd: explicit, args: [] };
  }

  const strategy = (cfg.get<string>("lg.install.strategy") || "managedVenv") as "managedVenv" | "pipx" | "system";

  // ——— DEV: system + задан python.interpreter → используем его как launcher —
  if (strategy === "system") {
    const interp = cfg.get<string>("lg.python.interpreter")?.trim();
    if (interp) {
      return { cmd: interp, args: ["-m", "lg.cli"] };
    }
  }

  if (strategy === "managedVenv") {
    // 1) гарантируем установленный CLI в управляемом venv
    if (!_ctx) { throw new Error("Extension context is not initialized"); }
    await ensureManagedCli(_ctx);
    const bin = await resolveManagedCliBin(_ctx);
    if (bin) return { cmd: bin, args: [] };
  }

  // 2) fallback: попробовать системный listing-generator из PATH
  try {
    await spawnToString(process.platform === "win32" ? "where" : "which", ["listing-generator"], { timeoutMs: 4000 });
    return { cmd: "listing-generator", args: [] };
  } catch { /* ignore */ }

  // 3) fallback: python -m lg.cli (потребуется python)
  const py = await findPython();
  if (py) {
    return { cmd: py, args: ["-m", "lg.cli"] };
  }

  return undefined;
}

function workspaceCwd(): string | undefined {
  const wf = vscode.workspace.workspaceFolders?.[0];
  return wf?.uri.fsPath;
}

// ---------------------- Публичные API для extension.ts ---------------------- //

export async function locateCliOrOfferInstall(ctx: vscode.ExtensionContext): Promise<string | undefined> {
  _ctx = ctx;
  const spec = await resolveCliRunSpec();
  if (spec) return spec.cmd; // упрощённый ответ для «быстрых» проверок

  const choice = await vscode.window.showInformationMessage(
    "Listing Generator CLI не найден. Установить автоматически в изолированный venv?",
    "Установить", "Позже"
  );
  if (choice === "Установить") {
    await ensureManagedCli(_ctx!);
  }
  return undefined;
}

export async function runListing(params: {
  section?: string;
  mode?: "all" | "changes";
  codeFenceOverride?: boolean | null;
  maxHeadingLevel?: number | null;
}): Promise<string> {
  const finalSpec = await resolveCliRunSpec();
  if (!finalSpec) throw new Error("CLI is not available. Configure `lg.python.interpreter` or `lg.cli.path`, or use managed venv.");

  const args: string[] = [...(finalSpec.args || [])];
  if (params.section) args.push("--section", params.section);
  if (params.mode) args.push("--mode", params.mode);
  // CLI по умолчанию уже fenced, но разрешим override
  if (params.codeFenceOverride === true) args.push("--code-fence");
  if (params.codeFenceOverride === false) {
    // нет прямого --no-code-fence флага, но мы можем задать через maxHeadingLevel только для md;
    // оставим пусто: используем дефолт CLI/конфига
  }
  if (typeof params.maxHeadingLevel === "number") {
    args.push("--max-heading-level", String(params.maxHeadingLevel));
  }
  const out = await spawnToString(finalSpec.cmd, args, { cwd: workspaceCwd(), timeoutMs: 60_000 });
  return out;
}

export async function runListIncluded(params: {
  section?: string;
  mode?: "all" | "changes";
}): Promise<string[]> {
  const finalSpec = await resolveCliRunSpec();
  if (!finalSpec) throw new Error("CLI is not available.");

  const args: string[] = [...(finalSpec.args || [])];
  if (params.section) args.push("--section", params.section);
  if (params.mode) args.push("--mode", params.mode);
  args.push("--list-included");
  const out = await spawnToString(finalSpec.cmd, args, { cwd: workspaceCwd(), timeoutMs: 60_000 });
  return out
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function runContext(templateName: string): Promise<string> {
  const finalSpec = await resolveCliRunSpec();
  if (!finalSpec) throw new Error("CLI is not available.");

  const args = [...(finalSpec.args || []), "--context", templateName];
  const out = await spawnToString(finalSpec.cmd, args, { cwd: workspaceCwd(), timeoutMs: 120_000 });
  return out;
}
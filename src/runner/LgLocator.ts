/**
 * Локатор CLI + высокоуровневые раннеры для запуска listing-generator.
 * Здесь:
 *  - учитываем настройки (явный путь к CLI, стратегия установки, интерпретатор);
 *  - управляемый venv внутри globalStorage;
 *  - fallback на системный CLI / python -m lg.cli;
 *  - удобные функции: runListing / runListIncluded / runContext.
 */
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { spawnToString } from "./LgProcess";
import { ensureManagedCli, resolveManagedCliBin } from "./LgInstaller";
import { findPython } from "./PythonFind";

export type RunSpec = { cmd: string; args: string[] };

async function resolveCliRunSpec(ctx: vscode.ExtensionContext): Promise<RunSpec | undefined> {
  const cfg = vscode.workspace.getConfiguration();
  const explicit = cfg.get<string>("lg.cli.path")?.trim();
  if (explicit) {
    // Явный путь к бинарю CLI
    return { cmd: explicit, args: [] };
  }

  const strategy = (cfg.get<string>("lg.install.strategy") || "managedVenv") as "managedVenv" | "pipx" | "system";

  if (strategy === "managedVenv") {
    // 1) гарантируем установленный CLI в управляемом venv
    await ensureManagedCli(ctx);
    const bin = await resolveManagedCliBin(ctx);
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
  const spec = await resolveCliRunSpec(ctx);
  if (spec) return spec.cmd; // упрощённый ответ для «быстрых» проверок

  const choice = await vscode.window.showInformationMessage(
    "Listing Generator CLI не найден. Установить автоматически в изолированный venv?",
    "Установить", "Позже"
  );
  if (choice === "Установить") {
    await ensureManagedCli(ctx);
  }
  return undefined;
}

export async function runListing(params: {
  section?: string;
  mode?: "all" | "changes";
  codeFenceOverride?: boolean | null;
  maxHeadingLevel?: number | null;
}): Promise<string> {
  const spec = await resolveCliRunSpec(vscode.extensions.getExtension("your-org.vscode-lg")?.exports?.context ?? ({} as any) );
  const ctx = (vscode.extensions.getExtension("your-org.vscode-lg") as any)?.exports?.context as vscode.ExtensionContext | undefined;
  const finalSpec = spec ?? (await resolveCliRunSpec(ctx!));
  if (!finalSpec) throw new Error("CLI is not available. Run 'LG: Doctor' or 'LG: Create Starter Config'.");

  const args: string[] = [];
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
  const spec = await resolveCliRunSpec(vscode.extensions.getExtension("your-org.vscode-lg")?.exports?.context ?? ({} as any) );
  const ctx = (vscode.extensions.getExtension("your-org.vscode-lg") as any)?.exports?.context as vscode.ExtensionContext | undefined;
  const finalSpec = spec ?? (await resolveCliRunSpec(ctx!));
  if (!finalSpec) throw new Error("CLI is not available.");

  const args: string[] = [];
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
  const spec = await resolveCliRunSpec(vscode.extensions.getExtension("your-org.vscode-lg")?.exports?.context ?? ({} as any) );
  const ctx = (vscode.extensions.getExtension("your-org.vscode-lg") as any)?.exports?.context as vscode.ExtensionContext | undefined;
  const finalSpec = spec ?? (await resolveCliRunSpec(ctx!));
  if (!finalSpec) throw new Error("CLI is not available.");

  const args = ["--context", templateName];
  const out = await spawnToString(finalSpec.cmd, args, { cwd: workspaceCwd(), timeoutMs: 120_000 });
  return out;
}
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
      return { cmd: interp, args: ["-m", "lg_vnext.cli"] };
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

  // 3) fallback: python -m lg_vnext.cli (потребуется python)
  const py = await findPython();
  if (py) {
    return { cmd: py, args: ["-m", "lg_vnext.cli"] };
  }

  return undefined;
}

/** Единое правило выбора корня: родитель lg-cfg, либо корень, где есть lg-cfg/config.yaml, иначе первый корень. */
export function effectiveWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return undefined;

  // 1) Если есть корень, который сам и есть "lg-cfg" → берем его родителя как общий root
  const cfgRoot = folders.find(f => {
    const base = require("path").basename(f.uri.fsPath).toLowerCase();
    return base === "lg-cfg" || f.name.toLowerCase().includes("lg config");
  });
  if (cfgRoot) {
    const parent = require("path").dirname(cfgRoot.uri.fsPath);
    return parent;
  }

  // 2) Иначе ищем корень, внутри которого существует lg-cfg/config.yaml
  for (const f of folders) {
    const p = require("path").join(f.uri.fsPath, "lg-cfg", "config.yaml");
    try {
      if (require("fs").existsSync(p)) {
        return f.uri.fsPath;
      }
    } catch {
      // ignore
    }
  }

  // 3) Fallback: первый корень
  return folders[0].uri.fsPath;
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

/** Универсальный запуск CLI с учётом preArgs (`python -m lg.cli`). Возвращает stdout как строку. */
export async function runCli(cliArgs: string[], opts: { timeoutMs?: number } = {}): Promise<string> {
  const spec = await resolveCliRunSpec();
  if (!spec) throw new Error("CLI is not available. Configure `lg.python.interpreter` or `lg.cli.path`, or use managed venv.");
  const args = [...spec.args, ...cliArgs];
  return spawnToString(spec.cmd, args, { cwd: effectiveWorkspaceRoot(), timeoutMs: opts.timeoutMs ?? 120_000 });
}

export async function runListing(params: {
  section?: string;
  mode?: "all" | "changes";
  codeFenceOverride?: boolean | null; // only false → --no-fence
}): Promise<string> {
  const target = params.section ? `sec:${params.section}` : "sec:all";
  const args: string[] = ["render", target];
  if (params.mode) args.push("--mode", params.mode);
  if (params.codeFenceOverride === false) args.push("--no-fence");
  return runCli(args, { timeoutMs: 60_000 });
 }

export async function runContext(templateName: string): Promise<string> {
  const args = ["render", `ctx:${templateName}`];
  return runCli(args, { timeoutMs: 120_000 });
}

export async function runContextStatsJson(params: { template: string; model?: string }): Promise<StatsJson> {
  const args = ["report", `ctx:${params.template}`, "--model", params.model ?? "o3"];
  const out = await runCli(args, { timeoutMs: 120_000 });
  const data = JSON.parse(out);
  return reportToStatsJson(data);
}

// ---------------------- JSON-friendly helpers ---------------------- //

export async function listSectionsJson(): Promise<string[]> {
  const out = await runCli(["list", "sections"], { timeoutMs: 20_000 });
  const data = JSON.parse(out);
  return Array.isArray(data.sections) ? data.sections : [];
}

export async function listContextsJson(): Promise<string[]> {
  const out = await runCli(["list", "contexts"], { timeoutMs: 20_000 });
  const data = JSON.parse(out);
  return Array.isArray(data.contexts) ? data.contexts : [];
}

export async function runListIncludedJson(params: { section?: string; mode?: "all" | "changes" }): Promise<{ path: string; sizeBytes: number }[]> {
  const target = params.section ? `sec:${params.section}` : "sec:all";
  const args: string[] = ["report", target];
  if (params.mode) args.push("--mode", params.mode);
  const out = await runCli(args, { timeoutMs: 60_000 });
  const data = JSON.parse(out);
  const files = Array.isArray(data.files) ? data.files : [];
  return files.map((f: any) => ({ path: f.path, sizeBytes: f.sizeBytes ?? 0 }));
}

export type StatsJson = {
  model: string;
  ctxLimit: number;
  total: { sizeBytes: number; tokens: number; ctxShare: number };
  files: { path: string; sizeBytes: number; tokens: number; promptShare: number; ctxShare: number }[];
};
export async function runStatsJson(params: { section?: string; mode?: "all" | "changes"; model?: string }): Promise<StatsJson> {
  const target = params.section ? `sec:${params.section}` : "sec:all";
  const args: string[] = ["report", target, "--model", params.model ?? "o3"];
  if (params.mode) args.push("--mode", params.mode);
  const out = await runCli(args, { timeoutMs: 90_000 });
  const data = JSON.parse(out);
  return reportToStatsJson(data);
}

export async function runDoctorJson(): Promise<any> {
  const out = await runCli(["diag"], { timeoutMs: 20_000 });
  return JSON.parse(out);
}

// ——————————— helpers ——————————— //
function reportToStatsJson(data: any): StatsJson {
  // ожидаем API v4 из lg/api_schema.py
  const model = String(data?.model ?? "unknown");
  const ctxLimit = Number(data?.ctxLimit ?? 0);
  const totalTokens =
    (typeof data?.total?.renderedTokens === "number" ? data.total.renderedTokens :
     typeof data?.total?.tokensProcessed === "number" ? data.total.tokensProcessed :
     0);
  const total = {
    sizeBytes: Number(data?.total?.sizeBytes ?? 0),
    tokens: totalTokens,
    ctxShare: Number(data?.total?.ctxShare ?? 0)
  };
  const files = Array.isArray(data?.files) ? data.files.map((f: any) => ({
    path: String(f.path),
    sizeBytes: Number(f.sizeBytes ?? 0),
    tokens: Number(f.tokensProcessed ?? f.tokensRaw ?? 0),
    promptShare: Number(f.promptShare ?? 0),
    ctxShare: Number(f.ctxShare ?? 0)
  })) : [];
  return { model, ctxLimit, total, files };
}
import * as vscode from "vscode";
import { spawnToString } from "../runner/LgProcess";
import { ensureManagedCli, resolveManagedCliBin } from "../runner/LgInstaller";
import { findPython } from "../runner/PythonFind";

export type RunSpec = { cmd: string; args: string[] };

let _ctx: vscode.ExtensionContext | undefined;
export function setExtensionContext(ctx: vscode.ExtensionContext) {
  _ctx = ctx;
}

/** Единое правило выбора корня: родитель lg-cfg, либо корень с lg-cfg/sections.yaml, иначе первый корень. */
export function effectiveWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return undefined;

  const cfgRoot = folders.find((f) => {
    const base = require("path").basename(f.uri.fsPath).toLowerCase();
    return base === "lg-cfg" || f.name.toLowerCase().includes("lg config");
  });
  if (cfgRoot) return require("path").dirname(cfgRoot.uri.fsPath);

  for (const f of folders) {
    const p = require("path").join(f.uri.fsPath, "lg-cfg", "sections.yaml");
    try {
      if (require("fs").existsSync(p)) return f.uri.fsPath;
    } catch { /* ignore */ }
  }
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
export async function runCli(cliArgs: string[], opts: { timeoutMs?: number } = {}): Promise<string> {
  const spec = await resolveCliRunSpec();
  if (!spec) throw new Error("CLI is not available. Configure `lg.python.interpreter` or `lg.cli.path`, or use managed venv.");
  const args = [...spec.args, ...cliArgs];
  return spawnToString(spec.cmd, args, { cwd: effectiveWorkspaceRoot(), timeoutMs: opts.timeoutMs ?? 120_000 });
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

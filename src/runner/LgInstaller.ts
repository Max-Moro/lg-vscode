import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as cp from "child_process";
import { findPython } from "./PythonFind";

function venvPaths(root: string) {
  const venv = path.join(root, ".venv-lg");
  const binDir = process.platform === "win32" ? path.join(venv, "Scripts") : path.join(venv, "bin");
  const py = process.platform === "win32" ? path.join(binDir, "python.exe") : path.join(binDir, "python");
  const cliExeWin = path.join(binDir, "listing-generator.exe");
  const cliCmdWin = path.join(binDir, "listing-generator.cmd");
  const cliUnix = path.join(binDir, "listing-generator");
  return { venv, binDir, py, cliExeWin, cliCmdWin, cliUnix };
}

function execSyncOrThrow(cmd: string, args: string[], opts: cp.SpawnSyncOptions) {
  const res = cp.spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32", ...opts });
  if (res.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(" ")}`);
  }
}

export async function ensureManagedCli(ctx: vscode.ExtensionContext): Promise<void> {
  const storage = ctx.globalStorageUri.fsPath;
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(storage));
  const { venv, py, cliExeWin, cliCmdWin, cliUnix } = venvPaths(storage);

  // If any CLI binary exists - consider it installed
  if (fs.existsSync(cliExeWin) || fs.existsSync(cliCmdWin) || fs.existsSync(cliUnix)) {
    return;
  }

  // 1) Select system Python for venv creation
  const interpBySetting = vscode.workspace.getConfiguration().get<string>("lg.python.interpreter")?.trim();
  const basePy = interpBySetting || (await findPython());
  if (!basePy) {
    throw new Error("Python 3.8+ not found. Install Python or specify the path in `lg.python.interpreter` setting.");
  }

  // 2) Create venv
  vscode.window.showInformationMessage("LG: Creating isolated environment (venv) and installing CLI…");
  execSyncOrThrow(basePy.split(" ")[0], basePy.includes(" ") ? basePy.split(" ").slice(1).concat(["-m", "venv", venv]) : ["-m", "venv", venv], { cwd: storage });

  // 3) Update pip and install listing-generator
  execSyncOrThrow(py, ["-m", "pip", "install", "--upgrade", "pip"], { cwd: storage });

  // Installation source:
  //   a) if lg/ folder with pyproject.toml exists in workspace - install from it (dev-flow);
  //   b) otherwise - install listing-generator from PyPI.
  const wf = vscode.workspace.workspaceFolders?.[0];
  const devLocal = wf && fs.existsSync(path.join(wf.uri.fsPath, "lg", "pyproject.toml"));
  if (devLocal) {
    execSyncOrThrow(py, ["-m", "pip", "install", "-e", path.join(wf!.uri.fsPath, "lg")], { cwd: storage });
  } else {
    execSyncOrThrow(py, ["-m", "pip", "install", "-U", "listing-generator"], { cwd: storage });
  }
}

export async function resolveManagedCliBin(ctx: vscode.ExtensionContext): Promise<string | undefined> {
  const storage = ctx.globalStorageUri.fsPath;
  const { cliExeWin, cliCmdWin, cliUnix } = venvPaths(storage);
  if (process.platform === "win32") {
    if (fs.existsSync(cliExeWin)) return cliExeWin;
    if (fs.existsSync(cliCmdWin)) return cliCmdWin;
  } else {
    if (fs.existsSync(cliUnix)) return cliUnix;
  }
  return undefined;
}

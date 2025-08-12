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

  // если уже есть любой бинарь CLI — считаем установленным
  if (fs.existsSync(cliExeWin) || fs.existsSync(cliCmdWin) || fs.existsSync(cliUnix)) {
    return;
  }

  // 1) выбираем системный Python для создания venv
  const interpBySetting = vscode.workspace.getConfiguration().get<string>("lg.python.interpreter")?.trim();
  const basePy = interpBySetting || (await findPython());
  if (!basePy) {
    throw new Error("Не найден Python 3.8+. Установите Python или укажите путь в настройке `lg.python.interpreter`.");
  }

  // 2) создаем venv
  vscode.window.showInformationMessage("LG: создаю изолированное окружение (venv) и устанавливаю CLI…");
  execSyncOrThrow(basePy.split(" ")[0], basePy.includes(" ") ? basePy.split(" ").slice(1).concat(["-m", "venv", venv]) : ["-m", "venv", venv], { cwd: storage });

  // 3) обновляем pip и ставим listing-generator
  execSyncOrThrow(py, ["-m", "pip", "install", "--upgrade", "pip"], { cwd: storage });

  // Источник установки:
  //   а) если в текущем workspace есть папка lg/ с pyproject.toml — ставим из неё (dev-флоу);
  //   б) иначе — ставим с PyPI пакет listing-generator.
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

import * as cp from "child_process";

function trySpawn(cmd: string, args: string[], timeoutMs = 4000): Promise<boolean> {
  return new Promise((resolve) => {
    const child = cp.spawn(cmd, args, { shell: process.platform === "win32" });
    let ok = false;
    const t = setTimeout(() => {
      child.kill();
      resolve(false);
    }, timeoutMs);
    child.on("error", () => resolve(false));
    child.on("exit", (code) => {
      clearTimeout(t);
      ok = code === 0;
      resolve(ok);
    });
  });
}

export async function findPython(): Promise<string | undefined> {
  // Priority: configured in settings → py (Windows) → python3 → python
  // (settings are handled in LgInstaller)
  if (process.platform === "win32") {
    if (await trySpawn("py", ["-3", "--version"])) return "py -3";
  }
  if (await trySpawn("python3", ["--version"])) return "python3";
  if (await trySpawn("python", ["--version"])) return "python";
  return undefined;
}

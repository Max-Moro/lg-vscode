/**
 * Универсальный запуск внешнего процесса (stdout → string).
 * Нужен для listing-generator в реальной интеграции.
 */
import * as cp from "child_process";

export function spawnToString(cmd: string, args: string[], options: cp.SpawnOptions & { timeoutMs?: number } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      // Гарантируем UTF-8 для Python-процесса (и вообще для stdout/err)
      PYTHONUTF8: "1",
      PYTHONIOENCODING: "utf-8"
    };
    const child = cp.spawn(cmd, args, { shell: process.platform === "win32", env, ...options });
    let out = "";
    let err = "";

    child.stdout?.on("data", (d) => (out += d.toString()));
    child.stderr?.on("data", (d) => (err += d.toString()));

    const killTimer = options.timeoutMs
      ? setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error(`Process timeout after ${options.timeoutMs} ms`));
        }, options.timeoutMs)
      : undefined;

    child.on("error", reject);
    child.on("close", (code) => {
      if (killTimer) clearTimeout(killTimer);
      if (code === 0) resolve(out);
      else reject(new Error(err || `Exited with code ${code}`));
    });
  });
}

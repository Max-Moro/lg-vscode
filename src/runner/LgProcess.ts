/**
 * Универсальный запуск внешнего процесса.
 * 
 * Этот модуль предоставляет единую функцию для запуска внешних процессов
 * с поддержкой timeout, stdin и разных режимов возврата результата.
 */
import * as cp from "child_process";

export interface SpawnOptions extends cp.SpawnOptions {
  timeoutMs?: number;
  stdinData?: string; // данные для передачи через stdin
  captureStderr?: boolean; // захватывать ли stderr (по умолчанию true)
}

export interface SpawnResult {
  stdout: string;
  stderr?: string; // опционально - возвращается только если captureStderr !== false
}

/**
 * Универсальная функция запуска процесса.
 * 
 * @param cmd - команда для запуска
 * @param args - аргументы команды
 * @param options - опции запуска
 * @returns Promise<SpawnResult> с stdout и опциональным stderr
 * 
 * @example
 * // Получить только stdout (stderr не захватывается)
 * const result = await spawn('python', ['--version'], { captureStderr: false });
 * console.log(result.stdout);
 * 
 * // Получить stdout + stderr (по умолчанию)
 * const result = await spawn('python', ['script.py'], {});
 * console.log(result.stdout, result.stderr);
 */
export function spawn(
  cmd: string,
  args: string[],
  options: SpawnOptions = {}
): Promise<SpawnResult> {
  const captureStderr = options.captureStderr !== false; // по умолчанию true
  
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
    
    // Захватываем stderr только если нужно
    if (captureStderr) {
      child.stderr?.on("data", (d) => (err += d.toString()));
    }

    // Передаем данные через stdin, если указаны
    if (options.stdinData !== undefined && child.stdin) {
      try {
        child.stdin.write(options.stdinData, "utf8");
        child.stdin.end();
      } catch (e) {
        reject(new Error(`Failed to write to stdin: ${e}`));
        return;
      }
    }

    const killTimer = options.timeoutMs
      ? setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error(`Process timeout after ${options.timeoutMs} ms`));
        }, options.timeoutMs)
      : undefined;

    child.on("error", reject);
    child.on("close", (code) => {
      if (killTimer) clearTimeout(killTimer);
      if (code === 0) {
        const result: SpawnResult = { stdout: out };
        if (captureStderr) {
          result.stderr = err;
        }
        resolve(result);
      } else {
        reject(new Error(err || `Exited with code ${code}`));
      }
    });
  });
}

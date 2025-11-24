/**
 * Universal external process execution.
 *
 * This module provides a single function to spawn external processes
 * with support for timeout, stdin, and different result return modes.
 */
import * as cp from "child_process";
import { CliExecutionException } from "../cli/CliException";

export interface SpawnOptions extends cp.SpawnOptions {
  timeoutMs?: number;
  stdinData?: string; // data to pass via stdin
  captureStderr?: boolean; // whether to capture stderr (defaults to true)
}

export interface SpawnResult {
  stdout: string;
  stderr?: string; // optional - returned only if captureStderr !== false
}

/**
 * Universal process execution function.
 *
 * @param cmd - command to execute
 * @param args - command arguments
 * @param options - execution options
 * @returns Promise<SpawnResult> with stdout and optional stderr
 * @throws CliExecutionException if process exits with non-zero code
 * @throws Error for other execution errors (spawn failure, stdin write failure, timeout)
 *
 * @example
 * // Get only stdout (stderr not captured)
 * const result = await spawn('python', ['--version'], { captureStderr: false });
 * console.log(result.stdout);
 *
 * // Get stdout + stderr (default)
 * const result = await spawn('python', ['script.py'], {});
 * console.log(result.stdout, result.stderr);
 */
export function spawn(
  cmd: string,
  args: string[],
  options: SpawnOptions = {}
): Promise<SpawnResult> {
  const captureStderr = options.captureStderr !== false; // default to true

  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      // Ensure UTF-8 for Python processes (and stdout/stderr in general)
      PYTHONUTF8: "1",
      PYTHONIOENCODING: "utf-8"
    };
    const child = cp.spawn(cmd, args, { shell: process.platform === "win32", env, ...options });
    let out = "";
    let err = "";

    child.stdout?.on("data", (d) => (out += d.toString()));

    // ALWAYS capture stderr for error handling
    // (even if captureStderr: false, needed for informative error messages)
    child.stderr?.on("data", (d) => (err += d.toString()));

    // Pass data via stdin if provided
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
        // On success, return stderr only if explicitly requested
        if (captureStderr) {
          result.stderr = err;
        }
        resolve(result);
      } else {
        // CLI process exited with non-zero code - throw structured exception
        // Message is auto-formatted from exitCode and stderr (Python stacktrace)
        reject(new CliExecutionException(
          code ?? -1,
          err
        ));
      }
    });
  });
}

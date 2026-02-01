import * as vscode from "vscode";

export type LogLevel = "error" | "warn" | "info" | "debug";

let channel: vscode.OutputChannel | undefined;
let currentLevel: LogLevel = "info";

const order: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

/**
 * Patterns for stack trace lines that are not useful for debugging.
 * These are Node.js internals and our internal spawn wrapper.
 */
const NOISE_PATTERNS = [
  /^\s+at\s+.*\(node:/,           // node:events, node:internal/*, node:net
  /^\s+at\s+.*LgProcess\.js:/,    // our spawn wrapper
  /^\s+at\s+ChildProcess\./,      // ChildProcess internal methods
  /^\s+at\s+Socket\./,            // Socket internal methods
  /^\s+at\s+Pipe\./,              // Pipe internal methods
];

/**
 * Formats error for logging.
 * - For CliExecutionException: only message (stacktrace is not useful, real error is in stderr)
 * - For other errors: message + filtered stacktrace (no Node.js internals)
 */
function formatError(error: Error): string {
  // CliExecutionException: stacktrace is just spawn noise, real error is in message
  if (error.name === "CliExecutionException") {
    return `${error.name}: ${error.message}`;
  }

  // Other errors: filter out noisy lines from stacktrace
  if (!error.stack) {
    return `${error.name}: ${error.message}`;
  }

  const lines = error.stack.split("\n");
  const filtered = lines.filter(line => {
    // Keep the first line (error message)
    if (!line.startsWith("    at ")) return true;
    // Filter out noise
    return !NOISE_PATTERNS.some(pattern => pattern.test(line));
  });

  return filtered.join("\n");
}

function ts() {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

function ensureChannel() {
  if (!channel) channel = vscode.window.createOutputChannel("Listing Generator");
  return channel;
}

export function initLogging(context: vscode.ExtensionContext) {
  const cfg = vscode.workspace.getConfiguration();
  currentLevel = (cfg.get<string>("lg.logging.level") as LogLevel) || "info";
  ensureChannel();
  // live-update level when settings change
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("lg.logging.level")) {
        const next = (vscode.workspace.getConfiguration().get<string>("lg.logging.level") as LogLevel) || "info";
        currentLevel = next;
        logInfo(`Logging level set to '${next}'`);
      }
    })
  );
}

function write(level: LogLevel, msg: string, error?: unknown) {
  if (order[level] <= order[currentLevel]) {
    const ch = ensureChannel();
    ch.appendLine(`${ts()} [${level.toUpperCase()}] ${msg}`);
  }
  // Always print error details, regardless of log level
  if (error !== undefined && error !== null) {
    const ch = ensureChannel();
    if (error instanceof Error) {
      ch.appendLine(formatError(error));
    } else {
      ch.appendLine(String(error));
    }
  }
}

export function logError(msg: string, error?: unknown) { write("error", msg, error); }
export function logWarn (msg: string, error?: unknown) { write("warn",  msg, error); }
export function logInfo (msg: string, error?: unknown) { write("info",  msg, error); }
export function logDebug(msg: string, error?: unknown) { write("debug", msg, error); }

export function showLogs() { ensureChannel().show(); }

export async function withDuration<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    const r = await fn();
    logDebug(`${label} — done in ${Date.now() - t0} ms`);
    return r;
  } catch (e) {
    logError(`${label} — failed after ${Date.now() - t0} ms`);
    throw e;
  }
}

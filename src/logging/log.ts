import * as vscode from "vscode";

export type LogLevel = "error" | "warn" | "info" | "debug";

let channel: vscode.OutputChannel | undefined;
let currentLevel: LogLevel = "info";

const order: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

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
  // Always print stack trace, regardless of log level
  if (error !== undefined && error !== null) {
    const ch = ensureChannel();
    if (error instanceof Error) {
      if (error.stack) {
        ch.appendLine(error.stack);
      } else {
        ch.appendLine(`${error.name}: ${error.message}`);
      }
    } else {
      // If not an Error, print as string
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
  } finally {
    // Errors not logged here — responsibility of caller.
  }
}

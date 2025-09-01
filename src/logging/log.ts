import * as vscode from "vscode";

export type LogLevel = "error" | "warn" | "info" | "debug" | "trace";

let channel: vscode.OutputChannel | undefined;
let currentLevel: LogLevel = "info";

const order: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3, trace: 4 };

function ts() {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

function ensureChannel() {
  if (!channel) channel = vscode.window.createOutputChannel("Listing Generator");
  return channel!;
}

export function initLogging(context: vscode.ExtensionContext) {
  const cfg = vscode.workspace.getConfiguration();
  currentLevel = (cfg.get<string>("lg.logging.level") as LogLevel) || "info";
  ensureChannel();
  // live-update уровня при смене настроек
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

function write(level: LogLevel, msg: string, meta?: unknown) {
  if (order[level] <= order[currentLevel]) {
    const ch = ensureChannel();
    ch.appendLine(`${ts()} [${level.toUpperCase()}] ${msg}`);
    if (meta !== undefined) {
      try { ch.appendLine(typeof meta === "string" ? meta : JSON.stringify(meta, null, 2)); }
      catch { /* ignore JSON issues */ }
    }
  }
}

export function logError(msg: string, meta?: unknown) { write("error", msg, meta); }
export function logWarn (msg: string, meta?: unknown) { write("warn",  msg, meta); }
export function logInfo (msg: string, meta?: unknown) { write("info",  msg, meta); }
export function logDebug(msg: string, meta?: unknown) { write("debug", msg, meta); }
export function logTrace(msg: string, meta?: unknown) { write("trace", msg, meta); }

export function showLogs() { ensureChannel().show(); }

export async function withDuration<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    const r = await fn();
    logDebug(`${label} — done in ${Date.now() - t0} ms`);
    return r;
  } finally {
    // Ошибки не логируем здесь — ответственность вызывающего.
  }
}

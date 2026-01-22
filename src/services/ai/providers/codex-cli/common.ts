import * as path from "path";
import * as os from "os";
import * as fs from "fs/promises";
import * as child_process from "child_process";
import type { ShellType } from "../../../../models/ShellType";

/**
 * Lock file for Codex CLI session detection
 */
export const CODEX_SESSION_LOCK_FILE = ".codex-session.lock";

/**
 * Get Codex home directory
 */
export function getCodexHome(): string {
  return process.platform === "win32"
    ? path.join(process.env.USERPROFILE || os.homedir(), ".codex")
    : path.join(process.env.HOME || os.homedir(), ".codex");
}

/**
 * Get workspace root from CliResolver
 */
export async function getWorkspaceRoot(): Promise<string> {
  const { effectiveWorkspaceRoot } = await import("../../../../cli/CliResolver");
  const root = effectiveWorkspaceRoot();
  if (!root) {
    throw new Error("No workspace root available");
  }
  return root;
}

/**
 * Get working directory considering scope
 */
export async function getWorkingDirectory(scope?: string): Promise<string> {
  const workspaceRoot = await getWorkspaceRoot();
  return scope ? path.join(workspaceRoot, scope) : workspaceRoot;
}

/**
 * Get absolute path to file in workspace considering scope
 */
export async function getWorkspacePath(fileName: string, scope?: string): Promise<string> {
  const workspaceRoot = await getWorkspaceRoot();
  return scope
    ? path.join(workspaceRoot, scope, fileName)
    : path.join(workspaceRoot, fileName);
}

/**
 * Get Codex CLI version
 */
export async function getCodexVersion(): Promise<string> {
  try {
    const output = await new Promise<string>((resolve, reject) => {
      child_process.exec("codex --version", { timeout: 3000 }, (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout.trim());
      });
    });
    const match = output.match(/v?([\d.]+)/);
    return match ? match[1] : "0.88.0";
  } catch {
    return "0.88.0";
  }
}

/**
 * Truncate text for display
 */
export function truncateForDisplay(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength) + "...";
}

/**
 * Format timestamp for session filename (2026-01-22T08-15-11)
 */
export function formatFileTimestamp(date: Date): string {
  const iso = date.toISOString();
  // 2026-01-22T08:15:11.357Z -> 2026-01-22T08-15-11
  return iso.substring(0, 19).replace(/:/g, "-");
}

/**
 * Generate UUID v7 (time-ordered)
 */
export function generateUuidV7(): string {
  const now = Date.now();
  const bytes = new Uint8Array(16);

  // Timestamp (48 bits) - big endian
  bytes[0] = (now / 0x10000000000) & 0xff;
  bytes[1] = (now / 0x100000000) & 0xff;
  bytes[2] = (now / 0x1000000) & 0xff;
  bytes[3] = (now / 0x10000) & 0xff;
  bytes[4] = (now / 0x100) & 0xff;
  bytes[5] = now & 0xff;

  // Random bits for remaining bytes
  const randomBytes = new Uint8Array(10);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(randomBytes);
  } else {
    for (let i = 0; i < 10; i++) {
      randomBytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes.set(randomBytes, 6);

  // Version 7
  bytes[6] = (bytes[6] & 0x0f) | 0x70;

  // Variant (RFC 4122)
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  // Format as UUID string
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Add entry to history.jsonl
 */
export async function addToHistoryIndex(params: {
  sessionId: string;
  timestamp: number;
  text: string;
}): Promise<void> {
  const { sessionId, timestamp, text } = params;

  const historyEntry = {
    session_id: sessionId,
    ts: Math.floor(timestamp / 1000),
    text: truncateForDisplay(text, 500)
  };

  const historyPath = path.join(getCodexHome(), "history.jsonl");
  const line = JSON.stringify(historyEntry) + "\n";

  try {
    await fs.appendFile(historyPath, line, "utf8");
  } catch (error) {
    const fsError = error as NodeJS.ErrnoException;
    if (fsError.code === "ENOENT") {
      const dirPath = path.dirname(historyPath);
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(historyPath, line, "utf8");
    } else {
      throw error;
    }
  }
}

/**
 * Activation prompt to start agent immediately after session resume
 */
const ACTIVATION_PROMPT = "Let's continue";

/**
 * Build Codex CLI launch command with lock file cleanup
 */
export function buildCodexCommand(
  sessionId: string,
  shell: ShellType,
  lockFile: string,
  reasoningEffort?: string
): string {
  // Build reasoning effort config override if not default
  const configArg = reasoningEffort && reasoningEffort !== "medium"
    ? ` --config "model_reasoning_effort=\\"${reasoningEffort}\\""`
    : "";

  // Add activation prompt to start agent immediately
  const codexCmd = `codex resume "${sessionId}"${configArg} "${ACTIVATION_PROMPT}"`;

  // Add cleanup depending on shell
  switch (shell) {
    case "powershell":
      return `try { ${codexCmd} } finally { Remove-Item "${lockFile}" -EA SilentlyContinue }`;

    case "cmd":
      return `${codexCmd} & if exist "${lockFile}" del /q "${lockFile}"`;

    case "bash":
    case "zsh":
    case "sh":
    default:
      return `(trap "rm -f \\"${lockFile}\\"" EXIT INT TERM HUP; ${codexCmd})`;
  }
}

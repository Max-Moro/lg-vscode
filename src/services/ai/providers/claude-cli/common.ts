import * as path from "path";
import * as os from "os";
import * as fs from "fs/promises";
import type { ShellType } from "../../../../models/ShellType";

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
 * Get path to project directory in ~/.claude/projects/
 */
export async function getClaudeProjectDir(scope?: string): Promise<string> {
  const cwd = await getWorkingDirectory(scope);
  const encodedPath = encodeProjectPath(cwd);
  return path.join(os.homedir(), '.claude', 'projects', encodedPath);
}

/**
 * Get path to session file
 */
export async function getClaudeSessionPath(sessionId: string, scope?: string): Promise<string> {
  const projectDir = await getClaudeProjectDir(scope);
  return path.join(projectDir, `${sessionId}.jsonl`);
}

/**
 * Encode project path into Claude Code format.
 *
 * Claude Code replaces path separators, colons, dots, and underscores with dashes.
 * The leading dash from Unix absolute paths is preserved.
 *
 * Examples:
 * - F:\workspace\project → F--workspace-project
 * - /home/user/project → -home-user-project
 * - F:\workspace\2026.01.02__Local_Project → F--workspace-2026-01-02--Local-Project
 */
export function encodeProjectPath(projectPath: string): string {
  const normalized = path.normalize(projectPath);

  // Replace path separators, colons, dots, and underscores with dashes
  // Note: leading dash from Unix paths is intentionally preserved
  const encoded = normalized.replace(/[/\\:._]/g, '-');

  return encoded;
}

/**
 * Add entry to history.jsonl for display in `claude -r`
 */
export async function addToHistoryIndex(params: {
  sessionId: string;
  cwd: string;
  displayText: string;
}): Promise<void> {
  const { sessionId, cwd, displayText } = params;

  const historyEntry = {
    display: displayText,
    pastedContents: {},
    timestamp: Date.now(),
    project: cwd,
    sessionId: sessionId
  };

  const historyPath = path.join(os.homedir(), '.claude', 'history.jsonl');
  const line = JSON.stringify(historyEntry) + '\n';

  try {
    await fs.appendFile(historyPath, line, 'utf8');
  } catch (error) {
    const fsError = error as NodeJS.ErrnoException;
    if (fsError.code === 'ENOENT') {
      const dirPath = path.dirname(historyPath);
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(historyPath, line, 'utf8');
    } else {
      throw error;
    }
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
 * Build Claude Code launch command with lock file cleanup
 */
export function buildClaudeCommand(
  permissionMode: string,
  shell: ShellType,
  lockFile: string,
  model?: string,
  sessionId?: string,
  activationPrompt?: string
): string {
  const modelArg = model ? ` --model ${model}` : "";

  // Build the main claude command
  let claudeCmd = `claude --permission-mode ${permissionMode}${modelArg}`;

  if (sessionId) {
    claudeCmd += ` -r "${sessionId}"`;
  }
  if (activationPrompt) {
    claudeCmd += ` "${activationPrompt}"`;
  }
  if (!sessionId && !activationPrompt) {
    throw new Error("At least one of sessionId or activationPrompt must be provided");
  }

  // Add cleanup depending on shell
  switch (shell) {
    case "powershell":
      // PowerShell: try-finally block
      return `try { ${claudeCmd} } finally { Remove-Item "${lockFile}" -EA SilentlyContinue }`;

    case "cmd":
      // CMD: simple sequence
      return `${claudeCmd} & if exist "${lockFile}" del /q "${lockFile}"`;

    case "bash":
    case "zsh":
    case "sh":
    default:
      // Bash/Zsh/Sh: trap for cleanup on any termination
      return `(trap "rm -f \\"${lockFile}\\"" EXIT INT TERM HUP; ${claudeCmd})`;
  }
}

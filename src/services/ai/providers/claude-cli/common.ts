import * as path from "path";
import * as os from "os";
import * as fs from "fs/promises";
import type { ShellType } from "../../../../models/ShellType";

/**
 * Получить workspace root из CliResolver
 */
export async function getWorkspaceRoot(): Promise<string> {
  const { effectiveWorkspaceRoot } = await import("../../../../cli/CliResolver");
  return effectiveWorkspaceRoot()!;
}

/**
 * Получить рабочую директорию с учётом scope
 */
export async function getWorkingDirectory(scope?: string): Promise<string> {
  const workspaceRoot = await getWorkspaceRoot();
  return scope ? path.join(workspaceRoot, scope) : workspaceRoot;
}

/**
 * Получить абсолютный путь к файлу в workspace с учётом scope
 */
export async function getWorkspacePath(fileName: string, scope?: string): Promise<string> {
  const workspaceRoot = await getWorkspaceRoot();
  return scope
    ? path.join(workspaceRoot, scope, fileName)
    : path.join(workspaceRoot, fileName);
}

/**
 * Получить путь к директории проекта в ~/.claude/projects/
 */
export async function getClaudeProjectDir(scope?: string): Promise<string> {
  const cwd = await getWorkingDirectory(scope);
  const encodedPath = encodeProjectPath(cwd);
  return path.join(os.homedir(), '.claude', 'projects', encodedPath);
}

/**
 * Получить путь к session файлу
 */
export async function getClaudeSessionPath(sessionId: string, scope?: string): Promise<string> {
  const projectDir = await getClaudeProjectDir(scope);
  return path.join(projectDir, `${sessionId}.jsonl`);
}

/**
 * Кодирование пути проекта в формат Claude Code
 *
 * Примеры:
 * - F:\workspace\project → F--workspace-project
 * - /home/user/project → home-user-project
 */
export function encodeProjectPath(projectPath: string): string {
  const normalized = path.normalize(projectPath);
  let encoded = normalized.replace(/[\\\/]/g, '-');

  if (encoded.startsWith('-')) {
    encoded = encoded.substring(1);
  }

  encoded = encoded.replace(/:/g, '-');
  return encoded;
}

/**
 * Добавление записи в history.jsonl для отображения в `claude -r`
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
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      const dirPath = path.dirname(historyPath);
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(historyPath, line, 'utf8');
    } else {
      throw error;
    }
  }
}

/**
 * Обрезка текста для отображения
 */
export function truncateForDisplay(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength) + "...";
}

/**
 * Построить команду запуска Claude Code с cleanup lock-файла
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

  // Формируем основную команду claude
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

  // Добавляем cleanup в зависимости от shell
  switch (shell) {
    case "powershell":
      // PowerShell: try-finally блок
      return `try { ${claudeCmd} } finally { Remove-Item "${lockFile}" -EA SilentlyContinue }`;

    case "cmd":
      // CMD: простая последовательность
      return `${claudeCmd} & if exist "${lockFile}" del /q "${lockFile}"`;

    case "bash":
    case "zsh":
    case "sh":
    default:
      // Bash/Zsh/Sh: trap для очистки при любом завершении
      return `(trap "rm -f \\"${lockFile}\\"" EXIT INT TERM HUP; ${claudeCmd})`;
  }
}

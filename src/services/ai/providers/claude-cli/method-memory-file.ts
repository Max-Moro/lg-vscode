import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { getWorkspacePath, buildClaudeCommand } from "./common";
import {CliExecutionContext} from "../../base";

/**
 * Способ интеграции: Memory File (CLAUDE.local.md)
 *
 * Преимущества:
 * - Стабильный, проверенный временем
 * - Простая реализация
 * - Быстрый (нет дополнительных запросов)
 *
 * Недостатки:
 * - CLAUDE.local.md виден всем субагентам (засоряет контекст)
 */

export const CLAUDE_LOCAL_FILE = "CLAUDE.local.md";
const ACTIVATION_PROMPT = "Process the context from CLAUDE.local.md and complete the task specified there. Communicate with the user in the language that is predominantly used in the Memory files section.";

/**
 * Записать контент в CLAUDE.local.md
 */
export async function writeMemoryFile(
  content: string,
  scope?: string
): Promise<string> {
  const claudeLocalPath = await getWorkspacePath(CLAUDE_LOCAL_FILE, scope);

  try {
    const dirPath = path.dirname(claudeLocalPath);
    await fs.mkdir(dirPath, { recursive: true });
    await fs.writeFile(claudeLocalPath, content, "utf8");
    return claudeLocalPath;
  } catch (error: any) {
    try {
      await fs.unlink(claudeLocalPath);
    } catch {}
    throw new Error(`Failed to write memory file: ${error.message}`);
  }
}

/**
 * Выполнить метод Memory File: записать CLAUDE.local.md и запустить Claude Code
 */
export async function executeMemoryFileMethod(
  content: string,
  terminal: vscode.Terminal,
  ctx: CliExecutionContext,
  permissionMode: string
): Promise<void> {
  const { logDebug } = await import("../../../../logging/log");

  logDebug(`[Claude CLI] Using memory-file method`);

  // Записываем контент в CLAUDE.local.md
  await writeMemoryFile(content, ctx.scope);

  // Формируем команду с cleanup
  const claudeCommand = buildClaudeCommand(
    permissionMode,
    ctx.shell,
    CLAUDE_LOCAL_FILE,
    ctx.claudeModel,
    undefined,
    ACTIVATION_PROMPT
  );

  logDebug(`[Claude CLI] Sending command: ${claudeCommand}`);
  terminal.sendText(claudeCommand, true);

  vscode.window.showInformationMessage(
    `Context sent to Claude CLI. Check the terminal.`
  );
}

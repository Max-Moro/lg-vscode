import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { BaseCliProvider, CliExecutionContext } from "../../base";
import { AiInteractionMode } from "../../../../models/AiInteractionMode";

/**
 * Начальный промпт для активации обработки контекста из CLAUDE.local.md
 */
const CLAUDE_ACTIVATION_PROMPT = "Process the context from CLAUDE.local.md and complete the task specified there. Communicate with the user in the language that is predominantly used in the Memory files section.";

/**
 * Имя временного файла для передачи контекста в Claude Code
 */
const CLAUDE_LOCAL_FILE = "CLAUDE.local.md";

export class ClaudeCliProvider extends BaseCliProvider {
  readonly id = "claude.cli";
  readonly name = "Claude CLI";

  /**
   * Получить абсолютный путь к временному файлу CLAUDE.local.md
   * с учётом workspace root и scope.
   */
  private async getClaudeLocalPath(ctx: CliExecutionContext): Promise<string> {
    const { effectiveWorkspaceRoot } = await import("../../../../cli/CliResolver");
    const workspaceRoot = effectiveWorkspaceRoot()!;

    return (ctx.scope && ctx.scope.trim())
      ? path.join(workspaceRoot, ctx.scope, CLAUDE_LOCAL_FILE)
      : path.join(workspaceRoot, CLAUDE_LOCAL_FILE);
  }

  /**
   * Проверить, занят ли терминал незавершенным процессом Claude.
   *
   * Эвристика: если файл CLAUDE.local.md существует, значит:
   * - Либо процесс claude еще работает
   * - Либо был завершен некорректно (без /exit)
   *
   * Если файла нет — trap отработал, процесс завершен корректно.
   */
  protected async checkTerminalBusy(
    terminal: vscode.Terminal,
    ctx: CliExecutionContext
  ): Promise<{ busy: boolean; message?: string }> {
    const claudeLocalPath = await this.getClaudeLocalPath(ctx);

    // Проверяем существование файла
    try {
      await fs.promises.access(claudeLocalPath);

      // Файл существует → терминал занят
      return {
        busy: true,
        message: `Claude CLI session is still active. Please run "/exit" in the terminal to complete the current session before starting a new one.`
      };
    } catch {
      // Файл не существует → терминал свободен
      return { busy: false };
    }
  }

  protected async executeInTerminal(
    content: string,
    terminal: vscode.Terminal,
    ctx: CliExecutionContext
  ): Promise<void> {
    const claudeLocalPath = await this.getClaudeLocalPath(ctx);

    try {
      // Создаем директорию если её нет (для случая с scope)
      const dirPath = path.dirname(claudeLocalPath);
      await fs.promises.mkdir(dirPath, { recursive: true });

      // Записываем контент в CLAUDE.local.md
      await fs.promises.writeFile(claudeLocalPath, content, "utf8");

      // Формируем и отправляем команду запуска Claude Code
      const permissionMode = this.mapModeToPermission(ctx.mode);
      const claudeCommand = this.buildClaudeCommandWithCleanup(permissionMode, ctx.shell, ctx.claudeModel);
      terminal.sendText(claudeCommand, true);

      vscode.window.showInformationMessage(
        `Context sent to ${this.name}. Check the terminal.`
      );
    } catch (error: any) {
      // В случае ошибки пытаемся удалить временный файл
      try {
        await fs.promises.unlink(claudeLocalPath);
      } catch {}

      throw new Error(`Failed to send context to Claude Code: ${error.message}`);
    }
  }

  /**
   * Построить команду запуска Claude Code с отложенной очисткой временного файла.
   *
   * Использует хуки оболочки (trap/try-finally) для автоматического удаления
   * CLAUDE.local.md после завершения работы Claude Code пользователем.
   */
  private buildClaudeCommandWithCleanup(permissionMode: string, shell: string, model?: string): string {
    const modelArg = model ? ` --model ${model}` : "";
    const claudeCmd = `claude --permission-mode ${permissionMode}${modelArg} "${CLAUDE_ACTIVATION_PROMPT}"`;

    switch (shell) {
      case "powershell":
        // PowerShell: try-finally блок для гарантированной очистки
        return `try { ${claudeCmd} } finally { Remove-Item "${CLAUDE_LOCAL_FILE}" -EA SilentlyContinue }`;

      case "cmd":
        // CMD: простая последовательность (нет встроенных хуков, но удаление после завершения)
        // Используем & для последовательного выполнения
        return `${claudeCmd} & if exist "${CLAUDE_LOCAL_FILE}" del /q "${CLAUDE_LOCAL_FILE}"`;

      case "bash":
      case "zsh":
      case "sh":
      default:
        // Bash/Zsh/Sh: trap для очистки при любом завершении (EXIT, INT, TERM, HUP)
        // Используем subshell для изоляции trap
        return `(trap "rm -f \\"${CLAUDE_LOCAL_FILE}\\"" EXIT INT TERM HUP; ${claudeCmd})`;
    }
  }
  
  /**
   * Преобразовать режим AI-взаимодействия в permission-mode для Claude Code
   */
  private mapModeToPermission(mode: AiInteractionMode): string {
    switch (mode) {
      case AiInteractionMode.ASK:
        return "plan";
      
      case AiInteractionMode.AGENT:
        return "acceptEdits";
      
      default:
        return "acceptEdits";
    }
  }
}

export const provider = new ClaudeCliProvider();
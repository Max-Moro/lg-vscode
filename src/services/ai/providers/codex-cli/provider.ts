import * as vscode from "vscode";
import { BaseCliProvider, CliExecutionContext } from "../../base";
import { AiInteractionMode } from "../../../../models/AiInteractionMode";
import type { CodexReasoningEffort } from "../../../../models/CodexReasoningEffort";
import { getDefaultCodexReasoningEffort } from "../../../../models/CodexReasoningEffort";
import { createCodexSession } from "./session";
import { getWorkspacePath, getWorkingDirectory, buildCodexCommand, CODEX_SESSION_LOCK_FILE } from "./common";

/**
 * OpenAI Codex CLI Provider
 *
 * Integrates with Codex CLI via session-based method:
 * 1. Creates a session file in ~/.codex/sessions/
 * 2. Launches `codex resume SESSION_ID` in terminal
 */
export class CodexCliProvider extends BaseCliProvider {
  readonly id = "codex.cli";
  readonly name = "Codex CLI";

  /**
   * Get reasoning effort from state
   */
  private async getReasoningEffort(): Promise<CodexReasoningEffort> {
    if (!this.context) {
      return getDefaultCodexReasoningEffort();
    }

    const { ControlStateService } = await import("../../../ControlStateService");
    const stateService = ControlStateService.getInstance(this.context);
    const state = stateService.getState();

    return (state.codexReasoningEffort as CodexReasoningEffort) || getDefaultCodexReasoningEffort();
  }

  protected async checkTerminalBusy(
    terminal: vscode.Terminal,
    ctx: CliExecutionContext
  ): Promise<{ busy: boolean; message?: string }> {
    if (terminal.exitStatus !== undefined) {
      return { busy: false };
    }

    return this.checkLockFile(
      CODEX_SESSION_LOCK_FILE,
      ctx.scope,
      `Codex CLI session is still active. Please run "/exit" in the terminal to complete the current session before starting a new one.`
    );
  }

  private async checkLockFile(
    lockFile: string,
    scope: string | undefined,
    message: string
  ): Promise<{ busy: boolean; message?: string }> {
    const fs = await import("fs/promises");
    const lockFilePath = await getWorkspacePath(lockFile, scope);

    try {
      await fs.access(lockFilePath);
      return { busy: true, message };
    } catch {
      return { busy: false };
    }
  }

  protected async executeInTerminal(
    content: string,
    terminal: vscode.Terminal,
    ctx: CliExecutionContext
  ): Promise<void> {
    const { logDebug, logWarn } = await import("../../../../logging/log");
    const fs = await import("fs/promises");

    // Get reasoning effort from state
    const reasoningEffort = await this.getReasoningEffort();

    // Determine sandbox mode from AI interaction mode
    const sandboxMode = ctx.mode === AiInteractionMode.ASK
      ? "read-only"
      : "workspace-write";

    const cwd = await getWorkingDirectory(ctx.scope);

    logDebug(`[Codex CLI] Creating session with reasoning effort: ${reasoningEffort}`);

    // Create session
    const sessionId = await createCodexSession({
      content,
      cwd,
      shell: ctx.shell,
      reasoningEffort,
      approvalPolicy: "on-request",
      sandboxMode
    });

    logDebug(`[Codex CLI] Session created: ${sessionId}`);

    // Create lock file
    const lockFilePath = await getWorkspacePath(CODEX_SESSION_LOCK_FILE, ctx.scope);
    try {
      await fs.writeFile(lockFilePath, "", "utf8");
      logDebug(`[Codex CLI] Lock file created: ${CODEX_SESSION_LOCK_FILE}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logWarn(`[Codex CLI] Failed to create lock file: ${errorMessage}`);
    }

    // Build and execute command
    const codexCommand = buildCodexCommand(
      sessionId,
      ctx.shell,
      CODEX_SESSION_LOCK_FILE,
      reasoningEffort
    );

    logDebug(`[Codex CLI] Sending command: ${codexCommand}`);
    terminal.sendText(codexCommand, true);

    vscode.window.showInformationMessage(
      `Codex CLI session started. Check the terminal.`
    );
  }
}

export const provider = new CodexCliProvider();

import * as vscode from "vscode";
import { BaseCliProvider, CliExecutionContext } from "../../base";
import type { ProviderModeInfo } from "../../types";
import { ClaudeIntegrationMethod } from "../../../../models/ClaudeIntegrationMethod";

// Session-based methods
import { createSessionManually } from "./method-manual";
import { createSessionFromHeadless } from "./method-headless";
import {
  addToHistoryIndex,
  truncateForDisplay,
  getWorkspacePath,
  getWorkingDirectory,
  buildClaudeCommand
} from "./common";

// Memory file method
import { executeMemoryFileMethod, CLAUDE_LOCAL_FILE } from "./method-memory-file";

const SESSION_LOCK_FILE = ".claude-session.lock";

/**
 * Claude CLI Provider with support for two integration methods:
 *
 * 1. Memory File (CLAUDE.local.md) - stable but visible to subagents
 * 2. Session (saved sessions) - better isolation from subagents
 *
 * The method is selected via the lg.claude.integrationMethod setting
 */
export class ClaudeCliProvider extends BaseCliProvider {
  readonly id = "com.anthropic.claude.cli";
  readonly name = "Claude CLI";

  /**
   * Get the preferred integration method from the state
   */
  private async getIntegrationMethod(): Promise<ClaudeIntegrationMethod> {
    if (!this.context) {
      return "session"; // fallback
    }

    const { getPCEStore } = await import("../../../../state/store");
    const store = getPCEStore(this.context);
    const state = store.getPersistentState();

    return state.claudeIntegrationMethod || "session";
  }

  protected async checkTerminalBusy(
    terminal: vscode.Terminal,
    ctx: CliExecutionContext
  ): Promise<{ busy: boolean; message?: string }> {
    if (terminal.exitStatus !== undefined) {
      return { busy: false };
    }

    const method = await this.getIntegrationMethod();
    const lockFile = method === "memory-file" ? CLAUDE_LOCAL_FILE : SESSION_LOCK_FILE;

    return this.checkLockFile(
        lockFile,
        ctx.scope,
        `Claude CLI session is still active. Please run "/exit" in the terminal to complete the current session before starting a new one.`
    );
  }

  /**
   * Check for the presence of a lock file
   */
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
    const method = await this.getIntegrationMethod();

    // runs is passed as-is to CLI (opaque string)
    if (method === "memory-file") {
      await executeMemoryFileMethod(content, terminal, ctx);
    } else {
      await this.executeSessionMethod(content, terminal, ctx);
    }
  }

  /**
   * Integration method: Session (saved sessions)
   */
  private async executeSessionMethod(
    content: string,
    terminal: vscode.Terminal,
    ctx: CliExecutionContext
  ): Promise<void> {
    const { logDebug, logWarn } = await import("../../../../logging/log");
    const fs = await import("fs/promises");

    logDebug(`[Claude CLI] Using session method`);

    const cwd = await getWorkingDirectory(ctx.scope);

    let sessionId: string;

    try {
      // Primary method: manual session creation
      logDebug(`[Claude CLI] Trying primary: manual session creation`);
      sessionId = await createSessionManually(content, ctx.scope);
    } catch (error) {
      // Fallback method: headless + replacement
      const errorMessage = error instanceof Error ? error.message : String(error);
      logWarn(`[Claude CLI] Primary method failed: ${errorMessage}`);
      logDebug(`[Claude CLI] Trying fallback: headless session creation`);
      sessionId = await createSessionFromHeadless(content, ctx.scope);
    }

    // Update history.jsonl
    await addToHistoryIndex({
      sessionId,
      cwd,
      displayText: truncateForDisplay(content, 100)
    });
    logDebug(`[Claude CLI] History index updated`);

    // Create lock file
    const lockFilePath = await getWorkspacePath(SESSION_LOCK_FILE, ctx.scope);

    try {
      await fs.writeFile(lockFilePath, "", "utf8");
      logDebug(`[Claude CLI] Lock file created: ${SESSION_LOCK_FILE}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logWarn(`[Claude CLI] Failed to create lock file: ${errorMessage}`);
    }

    // Run Claude Code with auto-cleanup of lock file
    // ctx.runs is passed as-is (opaque string from mode configuration)
    const claudeCommand = buildClaudeCommand(
      ctx.runs,
      ctx.shell,
      SESSION_LOCK_FILE,
      ctx.claudeModel,
      sessionId,
      "Let's continue"
    );

    logDebug(`[Claude CLI] Sending command: ${claudeCommand}`);
    terminal.sendText(claudeCommand, true);

    vscode.window.showInformationMessage(
      `Claude Code session started. Check the terminal.`
    );
  }

  getSupportedModes(): ProviderModeInfo[] {
    return [
      { modeId: "ask", runs: "--permission-mode default" },
      { modeId: "agent", runs: "--permission-mode acceptEdits" },
      { modeId: "plan", runs: "--permission-mode plan" }
    ];
  }
}

export const provider = new ClaudeCliProvider();

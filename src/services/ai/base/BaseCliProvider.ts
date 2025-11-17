import * as vscode from "vscode";
import { BaseAiProvider } from "./BaseAiProvider";
import type { AiInteractionMode } from "../../../models/AiInteractionMode";
import type { ShellType } from "../../../models/ShellType";

/**
 * CLI execution context with scope and shell configuration
 */
export interface CliExecutionContext {
  /** Workspace scope (subdirectory) for CLI execution */
  scope: string;
  /** Terminal shell type */
  shell: ShellType;
  /** AI interaction mode */
  mode: AiInteractionMode;
  /** Claude model (haiku, sonnet, opus) - optional, only for Claude CLI provider */
  claudeModel?: string;
}

/**
 * Base class for CLI-based providers
 *
 * Used for providers that work through CLI utilities in the terminal
 * (e.g., Claude CLI).
 *
 * Main capabilities:
 * - Terminal management (creation, reuse)
 * - Shell initialization with delay
 * - Support for scope (workspace subdirectory) and shell type
 * - Detection of incomplete processes in the terminal
 */
export abstract class BaseCliProvider extends BaseAiProvider {
  /** Extension context for accessing ControlStateService */
  protected context?: vscode.ExtensionContext;

  /**
   * Set extension context
   * Must be called before using the provider
   */
  setContext(context: vscode.ExtensionContext): void {
    this.context = context;
  }
  
  /**
   * Get basic CLI execution context from ControlStateService
   * @param mode - AI interaction mode
   * @returns Basic CLI execution context with scope, shell, and claudeModel settings
   */
  protected async getCliBaseContext(mode: AiInteractionMode): Promise<CliExecutionContext> {
    if (!this.context) {
      throw new Error("Extension context not set for CLI provider");
    }
    
    // Import ControlStateService
    const { ControlStateService } = await import("../../ControlStateService");
    const stateService = ControlStateService.getInstance(this.context);
    const state = stateService.getState();
    
    return {
      scope: state.cliScope || "",
      shell: state.cliShell!,
      mode,
      claudeModel: state.claudeModel
    };
  }

  /**
   * Check if the terminal is busy with an incomplete process.
   *
   * @param terminal - Terminal to check
   * @param ctx - Basic CLI execution context with scope settings
   * @returns object with busy flag and message for the user
   */
  protected abstract checkTerminalBusy(
    terminal: vscode.Terminal,
    ctx: CliExecutionContext
  ): Promise<{
    busy: boolean;
    message?: string;
  }>;

  /**
   * Create and prepare a terminal
   *
   * Reuses an existing terminal with the same name if it is not busy,
   * or creates a new one. Shows the terminal to the user and gives time for
   * shell initialization. The terminal starts in the effectiveWorkspaceRoot directory.
   *
   * @param ctx - Basic CLI execution context to check terminal availability
   * @returns Object with terminal and isNew flag, or undefined if terminal is busy
   */
  protected async ensureTerminal(
    ctx: CliExecutionContext
  ): Promise<{ terminal: vscode.Terminal; isNew: boolean } | undefined> {
    // Check for an existing terminal
    const existing = vscode.window.terminals.find(t => t.name === this.name);
    
    if (existing) {
      // Check if the terminal was properly closed
      if (existing.exitStatus !== undefined) {
        // Terminal is closed — cannot reuse, need to create a new one
        existing.dispose();
      } else {
        // Terminal is active — check if it is busy with a process
        const { busy, message } = await this.checkTerminalBusy(existing, ctx);
        
        if (busy) {
          // Show warning to the user with option to show terminal
          vscode.window.showWarningMessage(
            message || "Previous CLI session is still running. Please complete it before starting a new one.",
            "Show Terminal"
          ).then(choice => {
            if (choice === "Show Terminal") {
              existing.show(true);
            }
          });
          
          // Return undefined — terminal is busy, operation cancelled
          return undefined;
        }
        
        // Terminal is free — reuse it
        return { terminal: existing, isNew: false };
      }
    }

    // Get effective workspace root from CliResolver
    const { effectiveWorkspaceRoot } = await import("../../../cli/CliResolver");
    const workspaceRoot = effectiveWorkspaceRoot()!;

    // Create a new terminal in the effectiveWorkspaceRoot directory
    const terminal = vscode.window.createTerminal({
      name: this.name,
      hideFromUser: false,
      cwd: workspaceRoot
    });

    // Show the terminal
    terminal.show(true);

    // Give time for shell initialization (simple delay)
    await new Promise(resolve => setTimeout(resolve, 500));

    return { terminal, isNew: true };
  }

  /**
   * Send content via CLI
   *
   * Gets CLI execution context, prepares the terminal,
   * applies directory change if needed, and
   * calls executeInTerminal to execute the command.
   */
  async send(content: string, mode: AiInteractionMode): Promise<void> {
    // Get basic CLI execution context
    const baseCtx = await this.getCliBaseContext(mode);
       
    // Create terminal and get isNew flag
    const result = await this.ensureTerminal(baseCtx);
    
    // If terminal is busy, silently abort (user is already warned)
    if (!result) {
      return;
    }
    
    // Change directory for new terminal (if scope is set)
    if (result.isNew && baseCtx.scope && baseCtx.scope.trim()) {
      // Validate scope — check that it is a relative path.
      const path = require("path");
      if (path.isAbsolute(baseCtx.scope)) {
          throw new Error("Scope must be a relative path");
      }

      result.terminal.sendText(`cd "${baseCtx.scope}"`, true);
      
      // Small delay for cd to complete
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Execute provider-specific command
    await this.executeInTerminal(content, result.terminal, baseCtx);
  }

  /**
   * Method to execute CLI command in the terminal.
   *
   * Implemented by subclasses to form provider-specific command.
   * By the time of calling, the terminal is already in the correct directory (if scope was set).
   *
   * @param content - Content to send
   * @param terminal - Prepared terminal (already in the correct directory)
   * @param ctx - Basic CLI execution context with scope, shell, and mode settings
   */
  protected abstract executeInTerminal(
    content: string,
    terminal: vscode.Terminal,
    ctx: CliExecutionContext
  ): Promise<void>;
}
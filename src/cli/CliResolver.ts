/**
 * CLI resolver - manages Listing Generator CLI execution.
 *
 * Supports two modes:
 * 1. User Mode (default) - Auto-managed pipx installation with version pinning
 * 2. Developer Mode - Manual Python interpreter for testing unreleased CLI
 */
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "../runner/LgProcess";
import { PipxInstaller } from "../runner/PipxInstaller";
import { logDebug, logError, logInfo, withDuration } from "../logging/log";
import { CliException, CliUnavailableException } from "./CliException";

export type RunSpec = { cmd: string; args: string[] };

let _ctx: vscode.ExtensionContext | undefined;
export function setExtensionContext(ctx: vscode.ExtensionContext) {
  _ctx = ctx;
}

/** Single rule for selecting root: parent of lg-cfg, otherwise first root. */
export function effectiveWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return undefined;

  const cfgRoot = folders.find((f) => {
    const base = path.basename(f.uri.fsPath).toLowerCase();
    return base === "lg-cfg";
  });
  if (cfgRoot) return path.dirname(cfgRoot.uri.fsPath);

  return folders[0]?.uri.fsPath;
}

/**
 * Resolves CLI run specification based on mode.
 *
 * User Mode: Auto-install via pipx with version pinning
 * Developer Mode: Use configured Python interpreter with -m lg.cli
 *
 * @returns RunSpec with command and arguments
 * @throws Error if CLI cannot be resolved
 */
async function resolveCliRunSpec(): Promise<RunSpec> {
  const cfg = vscode.workspace.getConfiguration();
  const isDeveloperMode = cfg.get<boolean>("lg.developerMode") ?? false;

  if (isDeveloperMode) {
    return resolveDeveloperMode(cfg);
  } else {
    return resolveUserMode();
  }
}

/**
 * Resolves CLI in Developer Mode.
 *
 * Uses configured Python interpreter with -m lg.cli
 *
 * @param cfg VS Code configuration
 * @returns RunSpec for Python module execution
 * @throws CliUnavailableException if Python interpreter not configured or not found
 */
function resolveDeveloperMode(cfg: vscode.WorkspaceConfiguration): RunSpec {
  const pythonPath = cfg.get<string>("lg.python.interpreter")?.trim();

  if (!pythonPath) {
    throw new CliUnavailableException(
      "Developer Mode requires Python interpreter.\n" +
      "Configure 'lg.python.interpreter' in Settings pointing to your CLI dev venv.",
      false // Always loud
    );
  }

  if (!fs.existsSync(pythonPath)) {
    throw new CliUnavailableException(
      `Python interpreter not found: ${pythonPath}`,
      false // Always loud
    );
  }

  logDebug(`[CliResolver] Using Python: ${pythonPath}`);

  return {
    cmd: pythonPath,
    args: ["-m", "lg.cli"],
  };
}

/**
 * Resolves CLI in User Mode.
 *
 * Uses pipx to auto-install/upgrade CLI with version pinning.
 *
 * @returns RunSpec for listing-generator command
 * @throws CliUnavailableException if pipx is not available or installation fails
 */
async function resolveUserMode(): Promise<RunSpec> {
  // Get singleton instance (application-level service)
  const installer = PipxInstaller.getInstance();

  // Ensure CLI is installed with correct version
  const cliPath = await installer.ensureCli();

  logDebug(`[CliResolver] Using pipx CLI: ${cliPath}`);

  return {
    cmd: cliPath,
    args: [],
  };
}

/**
 * Internal unified CLI execution function.
 *
 * @param cliArgs - CLI command arguments
 * @param opts - execution options
 * @returns SpawnResult with stdout and optional stderr
 */
async function runCliInternal(
  cliArgs: string[],
  opts: { timeoutMs?: number; stdinData?: string; captureStderr?: boolean } = {}
) {
  const spec = await resolveCliRunSpec();

  const args = [...spec.args, ...cliArgs];
  const cwd = effectiveWorkspaceRoot();

  // Build display command for logging
  const stdinLabel = opts.stdinData !== undefined ? ' (with stdin)' : '';
  const cmdDisplay = `${spec.cmd} ${args.join(" ")}${stdinLabel}`;

  logDebug(`[CLI] ${cmdDisplay}`);

  return withDuration(`[CLI] ${cliArgs.join(" ")}`, async () => {
    try {
      const result = await spawn(spec.cmd, args, {
        cwd,
        timeoutMs: opts.timeoutMs ?? 120_000,
        stdinData: opts.stdinData,
        captureStderr: opts.captureStderr
      });

      logDebug(`[CLI] stdout bytes: ${result.stdout?.length ?? 0}`);

      // Useful to see stderr even at code 0 (some utilities write warnings)
      if (result.stderr?.trim()) {
        logDebug("[CLI] stderr (non-empty): " + result.stderr.trim().slice(0, 4000));
      }

      return result;
    } catch (e) {
      logError(`[CLI] ${cliArgs.join(" ")} — failed`, e);
      throw e;
    }
  });
}

/**
 * Unified CLI execution. Returns only stdout.
 */
export async function runCli(cliArgs: string[], opts: { timeoutMs?: number; stdinData?: string } = {}): Promise<string> {
  const result = await runCliInternal(cliArgs, { ...opts, captureStderr: false });
  return result.stdout;
}

/**
 * CLI execution with stdout+stderr return (needed for diag --bundle).
 */
export async function runCliResult(
  cliArgs: string[],
  opts: { timeoutMs?: number; stdinData?: string } = {}
): Promise<{ stdout: string; stderr: string }> {
  const result = await runCliInternal(cliArgs, { ...opts, captureStderr: true });
  return { stdout: result.stdout, stderr: result.stderr ?? "" };
}

/**
 * Quick check for CLI availability, with auto-install offer.
 *
 * Analyzes error types and shows appropriate UI only for first (loud) errors.
 * Silent errors (cached fatal failures) are logged but don't trigger popups.
 *
 * @param ctx Extension context
 * @returns CLI command path or undefined if unavailable
 */
export async function locateCliOrOfferInstall(ctx: vscode.ExtensionContext): Promise<string | undefined> {
  setExtensionContext(ctx);

  try {
    const spec = await resolveCliRunSpec();
    return spec.cmd;
  } catch (e) {
    // Silent errors - don't show UI
    if (e instanceof CliException && e.silent) {
      logDebug(`[locateCliOrOfferInstall] Silent failure: ${e.message}`);
      return undefined;
    }

    // Loud errors - analyze and show appropriate UI
    if (e instanceof CliUnavailableException) {
      const cfg = vscode.workspace.getConfiguration();
      const isDeveloperMode = cfg.get<boolean>("lg.developerMode") ?? false;

      if (isDeveloperMode) {
        // Developer Mode: show error and open settings
        vscode.window.showErrorMessage(
          e.message + "\n\nOpen Settings to configure Python interpreter?"
        );
        vscode.commands.executeCommand("workbench.action.openSettings", "lg.python.interpreter");
      } else {
        // User Mode: offer to install pipx or switch to Developer Mode
        const choice = await vscode.window.showInformationMessage(
          e.message + "\n\nEnable Developer Mode in Settings?",
          "Open Settings",
          "Later"
        );

        if (choice === "Open Settings") {
          vscode.commands.executeCommand("workbench.action.openSettings", "lg.developerMode");
        }
      }
    } else {
      // Unknown error category - generic message
      vscode.window.showErrorMessage(
        `Failed to initialize CLI: ${e instanceof Error ? e.message : String(e)}`
      );
    }

    return undefined;
  }
}

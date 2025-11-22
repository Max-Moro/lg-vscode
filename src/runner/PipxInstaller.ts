/**
 * Pipx-based CLI installer for User Mode.
 *
 * Manages automatic installation and upgrading of listing-generator CLI
 * via pipx with version pinning.
 */
import { spawn } from "./LgProcess";
import { CLI_VERSION, PYPI_PACKAGE, getVersionConstraint } from "../constants";
import { logDebug, logInfo, logWarn, logError } from "../logging/log";

/**
 * Manages pipx-based CLI installation.
 *
 * Responsibilities:
 * - Check if pipx is available
 * - Install CLI with pinned version
 * - Check installed CLI version
 * - Upgrade CLI within version constraint
 * - Auto-check for patch updates (cached for 24 hours)
 */
export class PipxInstaller {
  /**
   * Update check interval: 24 hours in milliseconds.
   */
  private static readonly UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

  /**
   * Timestamp of last update check (in-memory cache).
   * Resets on VS Code restart.
   */
  private lastUpdateCheck: number | null = null;

  /**
   * Ensures CLI is installed via pipx with correct version.
   *
   * Auto-installs or upgrades if needed.
   * Checks for patch updates once per 24 hours.
   *
   * @returns Path to installed CLI binary
   * @throws Error if pipx is not available or installation fails
   */
  async ensureCli(): Promise<string> {
    logDebug("[PipxInstaller] Ensuring CLI is installed");

    // Check if pipx is available
    if (!(await this.isPipxAvailable())) {
      throw new Error(
        "pipx not found. Install pipx (https://pipx.pypa.io/stable/) or enable Developer Mode."
      );
    }

    // Check installed version
    const installedVersion = await this.getInstalledVersion();

    if (!installedVersion) {
      // Not installed - install now
      logInfo("[PipxInstaller] CLI not installed, installing...");
      await this.install();
      this.lastUpdateCheck = Date.now(); // Mark as checked
    } else if (!this.isVersionCompatible(installedVersion)) {
      // Incompatible version - upgrade
      logWarn(`[PipxInstaller] Incompatible CLI version ${installedVersion}, upgrading...`);
      await this.upgrade();
      this.lastUpdateCheck = Date.now(); // Mark as checked
    } else if (this.shouldCheckForUpdates()) {
      // Compatible version, but check for patch updates periodically
      logInfo("[PipxInstaller] Checking for patch updates...");
      await this.upgrade(); // Reinstall with constraint → gets latest patch
      this.lastUpdateCheck = Date.now(); // Mark as checked
    } else {
      const nextCheckIn = this.getNextCheckInHours();
      logDebug(`[PipxInstaller] CLI version ${installedVersion} is compatible, next update check in ${nextCheckIn} hours`);
    }

    // Return path to CLI binary
    const cliPath = await this.getCliPath();
    if (!cliPath) {
      throw new Error("CLI installation failed: binary not found after install");
    }

    return cliPath;
  }

  /**
   * Checks if it's time to check for updates.
   *
   * @returns true if update check is needed (24 hours elapsed or never checked)
   */
  private shouldCheckForUpdates(): boolean {
    if (this.lastUpdateCheck === null) {
      return true; // Never checked
    }

    const elapsed = Date.now() - this.lastUpdateCheck;
    return elapsed >= PipxInstaller.UPDATE_CHECK_INTERVAL_MS;
  }

  /**
   * Calculates hours until next update check.
   *
   * @returns Hours remaining (rounded down)
   */
  private getNextCheckInHours(): number {
    if (this.lastUpdateCheck === null) {
      return 0;
    }

    const elapsed = Date.now() - this.lastUpdateCheck;
    const remaining = PipxInstaller.UPDATE_CHECK_INTERVAL_MS - elapsed;
    return Math.max(0, Math.floor(remaining / (60 * 60 * 1000)));
  }

  /**
   * Checks if pipx is available on the system.
   *
   * @returns true if pipx command is found, false otherwise
   */
  async isPipxAvailable(): Promise<boolean> {
    try {
      await spawn("pipx", ["--version"], { timeoutMs: 4000, captureStderr: false });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Installs CLI with version constraint using pipx.
   *
   * @throws Error if installation fails
   */
  async install(): Promise<void> {
    const versionConstraint = getVersionConstraint();
    const packageSpec = `"${PYPI_PACKAGE}${versionConstraint}"`;

    logInfo(`[PipxInstaller] Installing ${packageSpec}`);

    try {
      const result = await spawn("pipx", ["install", packageSpec], {
        timeoutMs: 120_000,
        captureStderr: true,
      });

      logDebug(`[PipxInstaller] Install output: ${result.stdout}`);
      logInfo("[PipxInstaller] CLI installed successfully");
    } catch (e: any) {
      logError("[PipxInstaller] Installation failed", e);
      throw new Error(`Failed to install CLI via pipx: ${e.message}`);
    }
  }

  /**
   * Upgrades CLI to latest compatible version.
   *
   * Uses reinstall with version constraint to ensure we stay within
   * compatible major.minor range (e.g., ^0.9.0 → latest 0.9.x, not 0.10.0).
   *
   * @throws Error if upgrade fails
   */
  async upgrade(): Promise<void> {
    logInfo("[PipxInstaller] Upgrading CLI");

    try {
      // Uninstall current version
      logDebug("[PipxInstaller] Uninstalling current version");
      await spawn("pipx", ["uninstall", PYPI_PACKAGE], {
        timeoutMs: 60_000,
        captureStderr: true,
      });

      // Reinstall with version constraint (will get latest patch version)
      logDebug("[PipxInstaller] Reinstalling with version constraint");
      await this.install();

      logInfo("[PipxInstaller] CLI upgraded successfully");
    } catch (e: any) {
      logError("[PipxInstaller] Upgrade failed", e);
      throw new Error(`Failed to upgrade CLI via pipx: ${e.message}`);
    }
  }

  /**
   * Checks installed CLI version.
   *
   * @returns Version string (e.g., "0.9.0") or null if not installed
   */
  async getInstalledVersion(): Promise<string | null> {
    try {
      const result = await spawn("listing-generator", ["--version"], {
        timeoutMs: 4000,
        captureStderr: false,
      });

      // Parse version from output (e.g., "listing-generator 0.9.0")
      const match = result.stdout.match(/(\d+\.\d+\.\d+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  /**
   * Gets path to installed CLI binary.
   *
   * @returns Path to listing-generator binary or null if not found
   */
  private async getCliPath(): Promise<string | null> {
    try {
      const cmd = process.platform === "win32" ? "where" : "which";
      const result = await spawn(cmd, ["listing-generator"], {
        timeoutMs: 4000,
        captureStderr: false,
      });

      // Return first line (path to binary)
      return result.stdout.trim().split("\n")[0] || null;
    } catch {
      return null;
    }
  }

  /**
   * Checks if installed version is compatible with required version.
   *
   * Compatible means same major.minor, any patch.
   *
   * @param installedVersion Installed version string (e.g., "0.9.1")
   * @returns true if compatible, false otherwise
   */
  private isVersionCompatible(installedVersion: string): boolean {
    const installed = this.parseVersion(installedVersion);
    const required = this.parseVersion(CLI_VERSION);

    return installed.major === required.major && installed.minor === required.minor;
  }

  /**
   * Parses semantic version string into components.
   *
   * @param version Version string (e.g., "0.9.0")
   * @returns Object with major, minor, patch numbers
   */
  private parseVersion(version: string): { major: number; minor: number; patch: number } {
    const parts = version.split(".").map((p) => parseInt(p, 10));
    return {
      major: parts[0] || 0,
      minor: parts[1] || 0,
      patch: parts[2] || 0,
    };
  }
}

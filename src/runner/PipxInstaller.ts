/**
 * Pipx-based CLI installer for User Mode.
 *
 * Manages automatic installation and upgrading of listing-generator CLI
 * via pipx with version pinning.
 *
 * Features:
 * - Mutex-based synchronization for concurrent calls
 * - Fatal error caching to avoid repeated install attempts
 * - Smart PyPI version check before reinstalling
 */
import { spawn } from "./LgProcess";
import { CLI_VERSION, PYPI_PACKAGE, getVersionConstraint } from "../constants";
import { logDebug, logInfo, logWarn, logError } from "../logging/log";
import { CliUnavailableException } from "../cli/CliException";

// noinspection ExceptionCaughtLocallyJS
/**
 * Manages pipx-based CLI installation.
 *
 * This is an application-level singleton service (similar to IntelliJ Plugin).
 * Must be accessed via getInstance() to ensure state consistency across
 * concurrent calls.
 *
 * Responsibilities:
 * - Check if pipx is available
 * - Install CLI with pinned version
 * - Check installed CLI version
 * - Upgrade CLI within version constraint
 * - Auto-check for patch updates (cached for 24 hours)
 *
 * Thread Safety:
 * - Uses Promise-based mutex to serialize install/upgrade operations
 * - Caches fatal errors to prevent repeated failed attempts
 */
export class PipxInstaller {
  /**
   * Singleton instance (application-level service).
   */
  private static instance: PipxInstaller | null = null;

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
   * Mutex for synchronizing install/upgrade operations.
   * Prevents race conditions when multiple coroutines try to install CLI simultaneously.
   */
  private installMutex: Promise<void> | null = null;

  /**
   * Cached fatal error message from first failed install/upgrade attempt.
   * Used to prevent repeated installation attempts and avoid spamming user with popups.
   * Resets on VS Code restart.
   */
  private fatalError: string | null = null;

  /**
   * Private constructor to prevent direct instantiation.
   * Use getInstance() instead.
   */
  private constructor() {}

  /**
   * Gets the singleton instance of PipxInstaller.
   *
   * @returns The singleton instance
   */
  public static getInstance(): PipxInstaller {
    if (!PipxInstaller.instance) {
      PipxInstaller.instance = new PipxInstaller();
    }
    return PipxInstaller.instance;
  }

  /**
   * Ensures CLI is installed via pipx with correct version.
   *
   * Auto-installs or upgrades if needed.
   * Checks for patch updates once per 24 hours.
   *
   * Thread Safety: Uses mutex to prevent concurrent install/upgrade operations.
   * Caches fatal errors to avoid repeated failed attempts.
   *
   * @returns Path to installed CLI binary
   * @throws CliUnavailableException if pipx is not available or installation fails
   *         (with silent=true for subsequent failures after fatal error)
   */
  async ensureCli(): Promise<string> {
    logDebug("[PipxInstaller] Ensuring CLI is installed");

    // Early check: if previous attempt failed fatally, fail silently
    if (this.fatalError) {
      logDebug(`[PipxInstaller] CLI unavailable due to previous fatal error: ${this.fatalError}`);
      throw new CliUnavailableException(this.fatalError, true); // SILENT
    }

    // Fast path: CLI already installed and compatible (most common case)
    const quickCheck = await this.getInstalledVersion();
    if (
      quickCheck !== null &&
      this.isVersionCompatible(quickCheck) &&
      !this.shouldCheckForUpdates()
    ) {
      // CLI is good, just return path
      const cliPath = await this.getCliPath();
      if (cliPath !== null) {
        return cliPath;
      }
      // Path not found - fall through to slow path with mutex
    }

    // Slow path: need to install/upgrade or handle errors
    // Use mutex to prevent concurrent pipx operations
    if (this.installMutex) {
      // Another operation is in progress - wait for it
      logDebug("[PipxInstaller] Waiting for concurrent install/upgrade to complete");
      await this.installMutex;

      // Re-check after waiting
      if (this.fatalError) {
        logDebug(`[PipxInstaller] CLI unavailable (checked after mutex): ${this.fatalError}`);
        throw new CliUnavailableException(this.fatalError, true); // SILENT
      }

      const cliPath = await this.getCliPath();
      if (cliPath) {
        return cliPath;
      }

      // Still not available - unexpected, but fail gracefully
      const error = "CLI installation failed: binary not found after install";
      this.fatalError = error;
      throw new CliUnavailableException(error, false);
    }

    // We are the first - acquire mutex
    let resolveMutex!: (value: void | PromiseLike<void>) => void;
    this.installMutex = new Promise<void>((resolve) => {
      resolveMutex = resolve;
    });

    try {
      // Critical section starts here
      logDebug("[PipxInstaller] Entered critical section");

      // Check if pipx is available
      if (!(await this.isPipxAvailable())) {
        const error =
          "pipx not found. Install pipx (https://pipx.pypa.io/stable/) or enable Developer Mode.";
        this.fatalError = error;
        logWarn("[PipxInstaller] pipx not available, caching fatal error");
        throw new CliUnavailableException(error, false); // FIRST - loud
      }

      // Check installed version (re-check inside mutex)
      const installedVersion = await this.getInstalledVersion();

      if (installedVersion === null) {
        // Not installed - install now
        logInfo("[PipxInstaller] CLI not installed, installing...");
        await this.install();
        this.lastUpdateCheck = Date.now();
      } else if (!this.isVersionCompatible(installedVersion)) {
        // Incompatible version - upgrade
        logWarn(
          `[PipxInstaller] Incompatible CLI version ${installedVersion}, upgrading...`
        );
        await this.upgrade();
        this.lastUpdateCheck = Date.now();
      } else if (this.shouldCheckForUpdates()) {
        // Compatible version, but check for patch updates periodically
        logInfo("[PipxInstaller] Checking for patch updates...");

        // Query PyPI for latest compatible version
        const latestVersion = await this.getLatestCompatibleVersion();

        if (latestVersion !== null) {
          if (this.isNewerVersion(latestVersion, installedVersion)) {
            logInfo(
              `[PipxInstaller] New patch version available: ${latestVersion} (current: ${installedVersion})`
            );
            await this.upgrade();
          } else {
            logDebug(
              `[PipxInstaller] Already on latest patch version: ${installedVersion}`
            );
          }
        } else {
          // PyPI check failed - skip upgrade this time
          logDebug(
            "[PipxInstaller] Skipping upgrade check (PyPI unavailable or version check failed)"
          );
        }

        // Always update timestamp to avoid repeated checks
        this.lastUpdateCheck = Date.now();
      } else {
        const nextCheckIn = this.getNextCheckInHours();
        logDebug(
          `[PipxInstaller] CLI version ${installedVersion} is compatible, next update check in ${nextCheckIn} hours`
        );
      }

      // Get CLI path after successful install/upgrade
      const cliPath = await this.getCliPath();
      if (!cliPath) {
        const error = "CLI installation failed: binary not found after install";
        this.fatalError = error;
        logError("[PipxInstaller]", new Error(error));
        throw new CliUnavailableException(error, false); // FIRST - loud
      }

      return cliPath;
    } catch (e) {
      // Cache fatal error from install/upgrade
      if (e instanceof CliUnavailableException) {
        // Already wrapped - re-throw
        throw e;
      }

      // Unexpected error - cache and convert to CliUnavailableException
      const error = `Unexpected error during install/upgrade: ${
        e instanceof Error ? e.message : String(e)
      }`;
      this.fatalError = error;
      logError("[PipxInstaller] Unexpected error during install/upgrade", e);
      throw new CliUnavailableException(error, false); // FIRST - loud
    } finally {
      // Release mutex
      resolveMutex();
      this.installMutex = null;
      logDebug("[PipxInstaller] Released mutex");
    }
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
   * Fetches latest compatible version from PyPI.
   *
   * Queries PyPI JSON API to get the latest version within compatible range
   * (same major.minor, any patch).
   *
   * @returns Latest compatible version string (e.g., "0.9.3") or null if unavailable/error
   */
  private async getLatestCompatibleVersion(): Promise<string | null> {
    try {
      const url = `https://pypi.org/pypi/${PYPI_PACKAGE}/json`;
      logDebug(`[PipxInstaller] Fetching latest version from PyPI: ${url}`);

      // Use Node.js https module for simple GET request
      const https = await import("https");

      const json = await new Promise<string>((resolve, reject) => {
        const req = https.get(
          url,
          { timeout: 5000 },
          (res) => {
            if (res.statusCode !== 200) {
              reject(new Error(`HTTP ${res.statusCode}`));
              return;
            }

            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => resolve(data));
          }
        );

        req.on("error", reject);
        req.on("timeout", () => {
          req.destroy();
          reject(new Error("Request timeout"));
        });
      });

      // Parse JSON response
      const data = JSON.parse(json);
      const latestVersion = data?.info?.version;

      if (!latestVersion || typeof latestVersion !== "string") {
        logWarn("[PipxInstaller] Failed to parse version from PyPI response");
        return null;
      }

      // Check if latest version is compatible (same major.minor)
      if (!this.isVersionCompatible(latestVersion)) {
        logDebug(
          `[PipxInstaller] Latest PyPI version ${latestVersion} is not compatible with ${CLI_VERSION}`
        );
        return null;
      }

      logDebug(`[PipxInstaller] Latest compatible version from PyPI: ${latestVersion}`);
      return latestVersion;
    } catch (e) {
      logDebug(
        `[PipxInstaller] Failed to fetch latest version from PyPI: ${
          e instanceof Error ? e.message : String(e)
        }`
      );
      return null;
    }
  }

  /**
   * Compares two version strings to determine if first is newer than second.
   *
   * @param latest First version string (e.g., "0.9.3")
   * @param current Second version string (e.g., "0.9.2")
   * @returns true if latest > current, false otherwise
   */
  private isNewerVersion(latest: string, current: string): boolean {
    const latestParsed = this.parseVersion(latest);
    const currentParsed = this.parseVersion(current);

    if (latestParsed.major > currentParsed.major) return true;
    if (latestParsed.major < currentParsed.major) return false;
    if (latestParsed.minor > currentParsed.minor) return true;
    if (latestParsed.minor < currentParsed.minor) return false;
    if (latestParsed.patch > currentParsed.patch) return true;

    return false;
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
   * @throws CliUnavailableException if installation fails
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
    } catch (e) {
      logError("[PipxInstaller] Installation failed", e);
      throw new CliUnavailableException(
        `Failed to install CLI via pipx: ${e instanceof Error ? e.message : String(e)}`,
        false
      );
    }
  }

  /**
   * Upgrades CLI to latest compatible version.
   *
   * Uses reinstall with version constraint to ensure we stay within
   * compatible major.minor range (e.g., ^0.9.0 → latest 0.9.x, not 0.10.0).
   *
   * @throws CliUnavailableException if upgrade fails
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
    } catch (e) {
      logError("[PipxInstaller] Upgrade failed", e);

      // If e is already CliUnavailableException, re-throw it
      if (e instanceof CliUnavailableException) {
        throw e;
      }

      throw new CliUnavailableException(
        `Failed to upgrade CLI via pipx: ${e instanceof Error ? e.message : String(e)}`,
        false
      );
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

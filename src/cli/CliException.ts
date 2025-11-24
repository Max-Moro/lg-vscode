/**
 * Exception hierarchy for CLI-related errors.
 *
 * Provides structured error handling with support for silent failures
 * (used to avoid repeated popups after cached fatal errors).
 */

/**
 * Base class for all CLI-related errors.
 */
export class CliException extends Error {
  constructor(
    message: string,
    public readonly silent: boolean = false
  ) {
    super(message);
    this.name = 'CliException';
  }
}

/**
 * CLI is unavailable (installation/configuration issues).
 * Can be silent on repeated attempts after fatal error.
 */
export class CliUnavailableException extends CliException {
  constructor(message: string, silent: boolean = false) {
    super(message, silent);
    this.name = 'CliUnavailableException';
  }
}

/**
 * CLI process exited with non-zero code.
 * Never silent - always indicates actual execution problem.
 *
 * The message is automatically formatted from stderr (Python stacktrace)
 * and exit code for user-facing error popups.
 */
export class CliExecutionException extends CliException {
  constructor(
    public readonly exitCode: number,
    public readonly stderr: string
  ) {
    super(CliExecutionException.formatMessage(exitCode, stderr), false);
    this.name = 'CliExecutionException';
  }

  /**
   * Formats error message for user-facing popup.
   * Preserves full Python stacktrace from stderr.
   */
  private static formatMessage(exitCode: number, stderr: string): string {
    const trimmed = stderr.trim();
    if (trimmed) {
      // Return full Python stacktrace as-is for user analysis
      return trimmed;
    }
    // Fallback if stderr is empty
    return `CLI process exited with code ${exitCode}`;
  }
}

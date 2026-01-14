export const EXT_ID = "max-moro.listing-generator";

/**
 * CLI version that this extension is compatible with.
 * Should match extension version in package.json.
 *
 * Format: Semantic versioning (e.g., "0.9.0")
 * Compatibility: ^0.9.0 means >=0.9.0 <0.10.0
 */
export const CLI_VERSION = "0.10.0";

/**
 * PyPI package name for Listing Generator CLI
 */
export const PYPI_PACKAGE = "listing-generator";

/**
 * Generates version constraint for pip/pipx install.
 * Returns a caret range: ^0.9.0 → >=0.9.0,<0.10.0
 */
export function getVersionConstraint(): string {
  const parts = CLI_VERSION.split(".");
  const major = parts[0];
  const minor = parts[1];
  const nextMinor = parseInt(minor, 10) + 1;

  return `>=${CLI_VERSION},<${major}.${nextMinor}.0`;
}

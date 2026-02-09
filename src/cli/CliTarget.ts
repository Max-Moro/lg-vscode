/**
 * CLI Target address utilities.
 *
 * Handles scoped target names (e.g., "@scope:name") which require
 * a different prefix format: "sec@scope:name" instead of "sec:@scope:name".
 */

/**
 * Build CLI target address from prefix and name.
 *
 * For regular names: "sec:name" or "ctx:name"
 * For scoped names (@scope:name): "sec@scope:name" or "ctx@scope:name"
 */
export function buildCliTarget(prefix: "sec" | "ctx", name: string): string {
  return name.startsWith("@") ? `${prefix}${name}` : `${prefix}:${name}`;
}

/**
 * Check if a target address refers to a context (vs section).
 */
export function isContextTarget(target: string): boolean {
  return target.startsWith("ctx:") || target.startsWith("ctx@");
}

/**
 * Extract the target name from a full target address.
 *
 * "sec:name" → "name"
 * "ctx:name" → "name"
 * "sec@scope:name" → "@scope:name"
 * "ctx@scope:name" → "@scope:name"
 */
export function extractTargetName(target: string): string {
  return target.replace(/^(ctx|sec):?/, "");
}

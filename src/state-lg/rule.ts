/**
 * LG Extension Rule Factory
 *
 * Uses createRuleFactory from state-engine with LG-specific types.
 */

import { createRuleFactory, RuleRegistry } from "../state-engine";
import type { BusinessRule } from "../state-engine";
import type { PCEState } from "./types";
import type { LGRuleResult } from "./store";

// Registry for LG rules (module-level singleton)
const lgRuleRegistry = new RuleRegistry<PCEState, LGRuleResult>();

/**
 * Define a business rule for LG Extension.
 *
 * Auto-registers in the global LG rule registry.
 *
 * @example
 * rule(SelectContext, {
 *   condition: (state, cmd) => cmd.template !== state.persistent.template,
 *   apply: (state, cmd) => ({
 *     mutations: { template: cmd.template },
 *     asyncOps: [...]
 *   })
 * });
 */
export const rule = createRuleFactory(lgRuleRegistry);

/**
 * Get all registered LG rules.
 */
export function getAllRules(): BusinessRule<PCEState, LGRuleResult>[] {
  return lgRuleRegistry.getAll();
}

/**
 * LG Extension Rule Factory
 *
 * Provides rule() function for defining LG business rules.
 */

import type { CommandOf, AnyCommandDef, BaseCommand, BusinessRule, RuleResult } from "../state-engine";
import type { PCEState } from "./types";
import type { LGRuleResult } from "./store";

// Global registry for LG rules (module-level)
// Note: LGRuleResult extends RuleResult<PCEState> with additional mutation types
// The store's applyMutations() handles the conversion
const lgRuleRegistry: BusinessRule<PCEState>[] = [];

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
export function rule<TDef extends AnyCommandDef>(
  cmd: TDef,
  config: {
    condition: (state: PCEState, cmd: CommandOf<TDef>) => boolean;
    apply: (state: PCEState, cmd: CommandOf<TDef>) => LGRuleResult;
  }
): void {
  lgRuleRegistry.push({
    trigger: cmd.type,
    condition: config.condition as (state: PCEState, cmd: BaseCommand) => boolean,
    // LGRuleResult is compatible with RuleResult<PCEState> - store handles additional fields
    apply: config.apply as unknown as (state: PCEState, cmd: BaseCommand) => RuleResult<PCEState>,
  });
}

/**
 * Get all registered LG rules.
 */
export function getAllRules(): BusinessRule<PCEState>[] {
  return lgRuleRegistry;
}

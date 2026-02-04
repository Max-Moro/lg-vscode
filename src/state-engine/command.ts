/**
 * State Engine - Command and Rule Factories
 *
 * Provides factories for defining commands and rules with type safety.
 * Registry is isolated per instance, not global.
 */

import type {
  BaseCommand,
  BusinessRule,
  RuleResult,
  CommandDef,
  CommandDefNoPayload,
  CommandOf,
  AnyCommandDef
} from "./types";

/**
 * Rule Registry - manages business rules for a specific state type.
 *
 * Each application creates its own registry instance.
 * Rules are registered via the rule() function bound to this registry.
 */
export class RuleRegistry<TState> {
  private rules: BusinessRule<TState>[] = [];

  /**
   * Register a rule. Called by rule() factory.
   */
  register(rule: BusinessRule<TState>): void {
    this.rules.push(rule);
  }

  /**
   * Get all registered rules.
   */
  getAll(): BusinessRule<TState>[] {
    return this.rules;
  }

  /**
   * Clear all rules (useful for testing).
   */
  clear(): void {
    this.rules = [];
  }
}

/**
 * Create a command definition.
 *
 * @example
 * const SelectContext = command("context/SELECT").payload<{ template: string }>();
 * const Initialize = command("lifecycle/INITIALIZE").noPayload();
 */
export function command<TType extends string>(type: TType) {
  return {
    payload: <TPayload>(): CommandDef<TType, TPayload> => ({
      type,
      create: (data: TPayload) => ({ type, ...data }) as { type: TType } & TPayload,
    }),
    noPayload: (): CommandDefNoPayload<TType> => ({
      type,
      create: () => ({ type }) as { type: TType },
    }),
  };
}

/**
 * Create a rule factory bound to a specific registry.
 *
 * @example
 * const registry = new RuleRegistry<MyState>();
 * const rule = createRuleFactory(registry);
 *
 * rule(SelectContext, {
 *   condition: (state, cmd) => true,
 *   apply: (state, cmd) => ({ mutations: { ... } })
 * });
 */
export function createRuleFactory<TState>(registry: RuleRegistry<TState>) {
  return function rule<TDef extends AnyCommandDef>(
    cmd: TDef,
    config: {
      condition: (state: TState, cmd: CommandOf<TDef>) => boolean;
      apply: (state: TState, cmd: CommandOf<TDef>) => RuleResult<TState>;
    }
  ): void {
    registry.register({
      trigger: cmd.type,
      condition: config.condition as (state: TState, cmd: BaseCommand) => boolean,
      apply: config.apply as (state: TState, cmd: BaseCommand) => RuleResult<TState>,
    });
  };
}

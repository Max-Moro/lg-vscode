/**
 * State Engine - Public API
 *
 * Universal state coordination engine for command-driven architectures.
 */

// Types
export type {
  BaseCommand,
  RuleResult,
  AsyncOperation,
  BusinessRule,
  CommandDef,
  CommandDefNoPayload,
  CommandOf,
  AnyCommandDef,
  UIMeta,
  MetaListener,
  StateListener,
  StateStore
} from "./types";

// Command and Rule factories
export { command, createRuleFactory, RuleRegistry } from "./command";

// Coordinator
export { StateCoordinator, nullLogger } from "./coordinator";
export type { CoordinatorLogger } from "./coordinator";

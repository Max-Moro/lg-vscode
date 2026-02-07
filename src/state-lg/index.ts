/**
 * LG Extension State Layer - Public API
 */

// Types
export type {
  PCEState,
  PersistentState,
  ConfigurationState,
  EnvironmentState,
  ProviderInfo
} from "./types";

export {
  createDefaultPCEState,
  createDefaultPersistentState,
  createDefaultConfigurationState,
  createDefaultEnvironmentState
} from "./types";

// Store
export { PCEStateStore } from "./store";
export type { LGRuleResult } from "./store";

// Coordinator (automatically registers all domain rules)
export { createLGCoordinator } from "./coordinator";
export type { LGStateCoordinator } from "./coordinator";

// Rule factory (for defining rules in domains and provider settings)
export { rule } from "./rule";

// Re-export command from engine for domain use
export { command } from "../state-engine";

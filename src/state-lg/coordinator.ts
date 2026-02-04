/**
 * LG Extension State Coordinator Setup
 *
 * Provides factory and types for using StateCoordinator with LG state.
 * The factory automatically registers all domain rules.
 */

import { StateCoordinator, type CoordinatorLogger } from "../state-engine";
import type { PCEState } from "./types";
import { PCEStateStore } from "./store";
import { logDebug, logError } from "../logging/log";

// Import domains for side-effect rule registration
import "./domains";
import { getAllRules } from "./rule";

/**
 * Logger adapter for StateCoordinator.
 */
const lgLogger: CoordinatorLogger = {
  debug: (msg) => logDebug(`[StateCoordinator] ${msg}`),
  error: (msg, error) => logError(`[StateCoordinator] ${msg}`, error)
};

/**
 * Type alias for LG's coordinator instance.
 */
export type LGStateCoordinator = StateCoordinator<PCEState>;

/**
 * Create a StateCoordinator configured for LG Extension.
 * Automatically registers all domain rules.
 */
export function createLGCoordinator(store: PCEStateStore): LGStateCoordinator {
  const coordinator = new StateCoordinator<PCEState>(store, lgLogger);
  coordinator.setRules(getAllRules());
  return coordinator;
}

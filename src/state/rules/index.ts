/**
 * Business Rules Index
 *
 * Exports all business rules as a single array for the StateCoordinator.
 */

import type { BusinessRule, Command } from "../types";
import { providerRules } from "./provider.rules";
import { contextRules } from "./context.rules";
import { adaptiveRules } from "./adaptive.rules";
import { tokenizerRules } from "./tokenizer.rules";
import { lifecycleRules, setLifecycleDependencies } from "./lifecycle.rules";
import { cliSettingsRules } from "./cli-settings.rules";

/**
 * All business rules combined
 */
export const ALL_RULES = [
  ...providerRules,
  ...contextRules,
  ...adaptiveRules,
  ...tokenizerRules,
  ...lifecycleRules,
  ...cliSettingsRules
] as BusinessRule<Command["type"]>[];

/**
 * Re-export lifecycle dependencies setter
 */
export { setLifecycleDependencies };

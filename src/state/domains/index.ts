/**
 * Domain Registry - Central registration of all domain modules
 */

import type { BusinessRule, DomainModule } from "../types";
import { contextDomain } from "./context";
import { sectionDomain } from "./section";
import { adaptiveDomain } from "./adaptive";
import { providerDomain } from "./provider";
import { tokenizationDomain } from "./tokenization";
import { lifecycleDomain, setLifecycleDependencies } from "./lifecycle";

// Re-export lifecycle dependencies setter
export { setLifecycleDependencies };

// All built-in domains
const BUILTIN_DOMAINS: DomainModule[] = [
  contextDomain,
  sectionDomain,
  adaptiveDomain,
  providerDomain,
  tokenizationDomain,
  lifecycleDomain
];

// Registry for dynamic domain/rule registration
const additionalRules: BusinessRule[] = [];

/**
 * Register additional rules (e.g., from provider settings modules)
 */
export function registerRules(rules: BusinessRule[]): void {
  additionalRules.push(...rules);
}

/**
 * Get all registered rules (built-in + additional)
 */
export function getAllRules(): BusinessRule[] {
  const builtinRules = BUILTIN_DOMAINS.flatMap(d => d.rules);
  return [...builtinRules, ...additionalRules];
}

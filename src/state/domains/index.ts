/**
 * Domain Registry - imports all domains for side-effect rule registration
 */

// Import domains to register their rules
import "./context";
import "./section";
import "./adaptive";
import "./provider";
import "./tokenization";
import "./lifecycle";

// Re-export getAllRules
export { getAllRules } from "../types";

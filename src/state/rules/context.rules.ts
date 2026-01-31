/**
 * Business rules for context selection
 */

import type { TypedRule } from "../types";
import { cliListModeSets, cliListTagSets } from "../../cli/CliClient";

/**
 * Rule: When contexts are loaded, validate current template selection
 */
export const contextsValidateSelection: TypedRule<"CONTEXTS_LOADED"> = {
  id: "contexts-validate-selection",
  description: "When contexts are loaded, validate current template selection",
  trigger: "CONTEXTS_LOADED",
  condition: () => true,
  apply: (state, cmd) => {
    const currentTemplate = state.persistent.template;
    const contexts = cmd.contexts;

    // Store contexts in configuration
    const configMutations = { contexts };

    // If current template is valid, keep it and trigger reload of adaptive data
    if (currentTemplate && contexts.includes(currentTemplate)) {
      return {
        configMutations,
        followUp: [{ type: "SELECT_CONTEXT", template: currentTemplate }]
      };
    }

    // Otherwise, select first available
    const newTemplate = contexts[0] || "";
    return {
      configMutations,
      mutations: newTemplate ? { template: newTemplate } : undefined,
      followUp: newTemplate
        ? [{ type: "SELECT_CONTEXT", template: newTemplate }]
        : []
    };
  }
};

/**
 * Rule: When context is selected, reload mode-sets and tag-sets
 */
export const contextChangeAdaptive: TypedRule<"SELECT_CONTEXT"> = {
  id: "context-change-adaptive",
  description: "When context is selected, reload mode-sets and tag-sets",
  trigger: "SELECT_CONTEXT",
  condition: (_state, cmd) => !!cmd.template,
  apply: (state, cmd) => ({
    mutations: { template: cmd.template },
    asyncOps: [
      {
        id: "load-mode-sets",
        execute: async () => {
          const modeSets = await cliListModeSets(cmd.template, state.persistent.providerId);
          return { type: "MODE_SETS_LOADED", modeSets };
        }
      },
      {
        id: "load-tag-sets",
        execute: async () => {
          const tagSets = await cliListTagSets(cmd.template);
          return { type: "TAG_SETS_LOADED", tagSets };
        }
      }
    ]
  })
};

/**
 * Rule: When sections are loaded, store them and validate selection
 */
export const sectionsLoaded: TypedRule<"SECTIONS_LOADED"> = {
  id: "sections-loaded",
  description: "When sections are loaded, store them and validate selection",
  trigger: "SECTIONS_LOADED",
  condition: () => true,
  apply: (state, cmd) => {
    const sections = cmd.sections;
    const currentSection = state.persistent.section;

    // Validate current selection
    const isValid = currentSection && sections.includes(currentSection);
    const newSection = isValid ? currentSection : (sections[0] || "");

    return {
      configMutations: { sections },
      mutations: currentSection !== newSection ? { section: newSection } : undefined
    };
  }
};

export const contextRules = [
  contextsValidateSelection,
  contextChangeAdaptive,
  sectionsLoaded
];

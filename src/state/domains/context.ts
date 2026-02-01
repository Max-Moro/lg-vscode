/**
 * Context Domain - context selection and task text
 *
 * Commands:
 * - context/SELECT - select context template
 * - context/SET_TASK - set task text
 * - context/LOADED - contexts list loaded from CLI
 */

import type { BusinessRule, DomainModule, BaseCommand, PCEState } from "../types";
import { cliListModeSets, cliListTagSets } from "../../cli/CliClient";

// ============================================
// Commands
// ============================================

export interface SelectContextCmd extends BaseCommand {
  type: "context/SELECT";
  template: string;
}

export interface SetTaskCmd extends BaseCommand {
  type: "context/SET_TASK";
  text: string;
}

export interface ContextsLoadedCmd extends BaseCommand {
  type: "context/LOADED";
  contexts: string[];
}

export type ContextCommand = SelectContextCmd | SetTaskCmd | ContextsLoadedCmd;

// ============================================
// Rules
// ============================================

const contextsLoaded: BusinessRule = {
  id: "context/loaded",
  description: "When contexts are loaded, validate current template selection",
  trigger: "context/LOADED",
  condition: () => true,
  apply: (state: PCEState, cmd: BaseCommand) => {
    const { contexts } = cmd as ContextsLoadedCmd;
    const currentTemplate = state.persistent.template;

    const configMutations = { contexts };

    // If current template is valid, just update config (no cascade needed)
    if (currentTemplate && contexts.includes(currentTemplate)) {
      return { configMutations };
    }

    // Current template invalid - select first available and trigger cascade
    const newTemplate = contexts[0] || "";
    return {
      configMutations,
      mutations: newTemplate ? { template: newTemplate } : undefined,
      // Trigger context/SELECT to load mode-sets and tag-sets for new template
      followUp: newTemplate ? [{ type: "context/SELECT", template: newTemplate }] : []
    };
  }
};

const contextSelect: BusinessRule = {
  id: "context/select",
  description: "When context changes, reload mode-sets and tag-sets",
  trigger: "context/SELECT",
  // Only trigger if template actually changed (not same value from UI)
  condition: (state: PCEState, cmd: BaseCommand) => {
    const { template } = cmd as SelectContextCmd;
    return !!template && template !== state.persistent.template;
  },
  apply: (state: PCEState, cmd: BaseCommand) => {
    const { template } = cmd as SelectContextCmd;
    return {
      mutations: { template },
      asyncOps: [
        {
          id: "load-mode-sets",
          execute: async () => {
            const modeSets = await cliListModeSets(template, state.persistent.providerId);
            return { type: "adaptive/MODE_SETS_LOADED", modeSets };
          }
        },
        {
          id: "load-tag-sets",
          execute: async () => {
            const tagSets = await cliListTagSets(template);
            return { type: "adaptive/TAG_SETS_LOADED", tagSets };
          }
        }
      ]
    };
  }
};

const taskTextSet: BusinessRule = {
  id: "context/set-task",
  description: "When task text is set, update persistent state",
  trigger: "context/SET_TASK",
  condition: () => true,
  apply: (_state: PCEState, cmd: BaseCommand) => ({
    mutations: { taskText: (cmd as SetTaskCmd).text }
  })
};

// ============================================
// Domain Module Export
// ============================================

export const contextDomain: DomainModule = {
  id: "context",
  rules: [contextsLoaded, contextSelect, taskTextSet]
};

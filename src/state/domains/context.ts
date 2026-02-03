/**
 * Context Domain - context selection and task text
 */

import { command, rule, type PCEState, type AsyncOperation } from "../types";
import { cliListModeSets, cliListTagSets, cliListSections } from "../../cli/CliClient";
import { getGitService } from "../../bootstrap";

// ============================================
// Commands
// ============================================

export const SelectContext = command("context/SELECT").payload<{ template: string }>();
export const SetTask = command("context/SET_TASK").payload<{ text: string }>();
export const ContextsLoaded = command("context/LOADED").payload<{ contexts: string[] }>();

// ============================================
// Rules
// ============================================

/** When contexts are loaded, validate current template selection */
rule(ContextsLoaded, {
  condition: () => true,
  apply: (state: PCEState, cmd) => {
    const { contexts } = cmd;
    const currentTemplate = state.persistent.template;

    const configMutations = { contexts };

    if (currentTemplate && contexts.includes(currentTemplate)) {
      return { configMutations };
    }

    const newTemplate = contexts[0] || "";
    return {
      configMutations,
      followUp: newTemplate ? [SelectContext.create({ template: newTemplate })] : []
    };
  }
});

/** When context changes, reload sections, mode-sets and tag-sets */
rule(SelectContext, {
  condition: (state: PCEState, cmd) => {
    return !!cmd.template && cmd.template !== state.persistent.template;
  },
  apply: (state: PCEState, cmd) => {
    const { template } = cmd;
    const asyncOps: AsyncOperation[] = [
      {
        id: "load-sections",
        execute: async () => {
          const sections = await cliListSections(template);
          return { type: "section/LOADED", sections };
        }
      },
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
    ];

    // Load branches if review mode is active for the new context
    const newModes = state.persistent.modesByContextProvider[template]?.[state.persistent.providerId] || {};
    const isReviewActive = Object.values(newModes).includes("review");
    if (isReviewActive) {
      asyncOps.push({
        id: "load-branches",
        execute: async () => {
          const gitService = getGitService();
          const branches = await gitService.getBranchNames();
          return { type: "adaptive/BRANCHES_LOADED", branches };
        }
      });
    }

    return {
      mutations: { template },
      asyncOps
    };
  }
});

/** When task text is set, update persistent state */
rule(SetTask, {
  condition: () => true,
  apply: (_state: PCEState, cmd) => ({
    mutations: { taskText: cmd.text }
  })
});

/**
 * Adaptive Domain - modes, tags, and target branch (review mode)
 */

import { command } from "../../state-engine";
import { rule } from "../rule";
import type { PCEState } from "../types";
import type { LGRuleResult } from "../store";
import type { ModeSetsList } from "../../models/mode_sets_list";
import type { TagSetsList } from "../../models/tag_sets_list";
import { getGitService } from "../../bootstrap";

// ============================================
// Commands
// ============================================

export const SelectMode = command("adaptive/SELECT_MODE").payload<{ modeSetId: string; modeId: string }>();
export const ToggleTag = command("adaptive/TOGGLE_TAG").payload<{ tagSetId: string; tagId: string }>();
export const SelectBranch = command("adaptive/SELECT_BRANCH").payload<{ branch: string }>();
export const ModeSetsLoaded = command("adaptive/MODE_SETS_LOADED").payload<{ modeSets: ModeSetsList }>();
export const TagSetsLoaded = command("adaptive/TAG_SETS_LOADED").payload<{ tagSets: TagSetsList }>();
export const BranchesLoaded = command("adaptive/BRANCHES_LOADED").payload<{ branches: string[] }>();

// ============================================
// Rules
// ============================================

/** When mode-sets are loaded, ensure all mode-sets have valid selection */
rule(ModeSetsLoaded, {
  condition: () => true,
  apply: (state: PCEState, cmd) => {
    const { modeSets } = cmd;
    const ctx = state.persistent.template;
    const provider = state.persistent.providerId;
    const savedModes = state.persistent.modesByContextProvider[ctx]?.[provider] || {};

    const actualizedModes: Record<string, string> = {};

    for (const modeSet of modeSets["mode-sets"]) {
      const savedModeId = savedModes[modeSet.id];
      const modeExists = modeSet.modes.some(m => m.id === savedModeId);

      if (savedModeId && modeExists) {
        actualizedModes[modeSet.id] = savedModeId;
      } else {
        // For ai-interaction mode-set, prefer "agent" mode as default
        let defaultMode = modeSet.modes[0];
        if (modeSet.id === "ai-interaction") {
          const agentMode = modeSet.modes.find(m => m.id === "agent");
          if (agentMode) {
            defaultMode = agentMode;
          }
        }
        if (defaultMode) {
          actualizedModes[modeSet.id] = defaultMode.id;
        }
      }
    }

    return {
      configMutations: { modeSets },
      mutations: {
        modesByContextProvider: {
          ...state.persistent.modesByContextProvider,
          [ctx]: {
            ...state.persistent.modesByContextProvider[ctx],
            [provider]: actualizedModes
          }
        }
      }
    };
  }
});

/** When tag-sets are loaded, remove invalid saved tags */
rule(TagSetsLoaded, {
  condition: () => true,
  apply: (state: PCEState, cmd) => {
    const { tagSets } = cmd;
    const ctx = state.persistent.template;
    const savedTags = state.persistent.tagsByContext[ctx] || {};

    const validPairs = new Map<string, Set<string>>();
    for (const tagSet of tagSets["tag-sets"]) {
      validPairs.set(tagSet.id, new Set(tagSet.tags.map(t => t.id)));
    }

    const validatedTags: Record<string, string[]> = {};
    for (const [setId, tagIds] of Object.entries(savedTags)) {
      const validTagsInSet = validPairs.get(setId);
      if (!validTagsInSet) continue;

      const filteredTags = tagIds.filter(id => validTagsInSet.has(id));
      if (filteredTags.length > 0) {
        validatedTags[setId] = filteredTags;
      }
    }

    const hasChanges = JSON.stringify(savedTags) !== JSON.stringify(validatedTags);

    return {
      configMutations: { tagSets },
      mutations: hasChanges ? {
        tagsByContext: {
          ...state.persistent.tagsByContext,
          [ctx]: validatedTags
        }
      } : undefined
    };
  }
});

/** When mode changes, update persistent state and load branches if entering review mode */
rule(SelectMode, {
  condition: (state: PCEState, cmd) => {
    const { modeSetId, modeId } = cmd;
    const ctx = state.persistent.template;
    const provider = state.persistent.providerId;
    const currentModeId = state.persistent.modesByContextProvider[ctx]?.[provider]?.[modeSetId];
    return modeId !== currentModeId;
  },
  apply: (state: PCEState, cmd) => {
    const { modeSetId, modeId } = cmd;
    const ctx = state.persistent.template;
    const provider = state.persistent.providerId;

    const result: LGRuleResult = {
      mutations: {
        modesByContextProvider: {
          ...state.persistent.modesByContextProvider,
          [ctx]: {
            ...state.persistent.modesByContextProvider[ctx],
            [provider]: {
              ...state.persistent.modesByContextProvider[ctx]?.[provider],
              [modeSetId]: modeId
            }
          }
        }
      }
    };

    // Load branches when switching to review mode
    if (modeId === "review") {
      result.asyncOps = [{
        execute: async () => {
          const gitService = getGitService();
          const branches = await gitService.getBranchNames();
          return { type: "adaptive/BRANCHES_LOADED", branches };
        }
      }];
    }

    return result;
  }
});

/** When tag is toggled, update persistent state */
rule(ToggleTag, {
  condition: () => true,
  apply: (state: PCEState, cmd) => {
    const { tagSetId, tagId } = cmd;
    const ctx = state.persistent.template;
    const currentTags = state.persistent.tagsByContext[ctx] || {};
    const tagsInSet = currentTags[tagSetId] || [];

    const isCurrentlySelected = tagsInSet.includes(tagId);
    const newTagsInSet = isCurrentlySelected
      ? tagsInSet.filter(id => id !== tagId)
      : [...tagsInSet, tagId];

    const newTags = { ...currentTags };
    if (newTagsInSet.length > 0) {
      newTags[tagSetId] = newTagsInSet;
    } else {
      delete newTags[tagSetId];
    }

    return {
      mutations: {
        tagsByContext: {
          ...state.persistent.tagsByContext,
          [ctx]: newTags
        }
      }
    };
  }
});

/** When branches are loaded, validate target branch selection */
rule(BranchesLoaded, {
  condition: () => true,
  apply: (state: PCEState, cmd) => {
    const { branches } = cmd;
    const currentBranch = state.persistent.targetBranch;

    const branchSet = new Set(branches);
    const candidates = [currentBranch, "main", "master", "origin/main", "origin/master"];
    const newBranch = candidates.find(b => b && branchSet.has(b)) || branches[0] || "";

    return {
      envMutations: { branches },
      mutations: newBranch !== currentBranch ? { targetBranch: newBranch } : undefined
    };
  }
});

/** When target branch changes, update persistent state */
rule(SelectBranch, {
  condition: (state: PCEState, cmd) => {
    const { branch } = cmd;
    return branch !== state.persistent.targetBranch;
  },
  apply: (_state: PCEState, cmd) => ({
    mutations: { targetBranch: cmd.branch }
  })
});

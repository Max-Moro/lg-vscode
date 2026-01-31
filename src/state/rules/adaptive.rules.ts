/**
 * Business rules for mode-sets and tag-sets (adaptive settings)
 */

import type { TypedRule } from "../types";

/**
 * Rule: When mode-sets are loaded, ensure all mode-sets have valid selection
 */
export const modeSetsActualize: TypedRule<"MODE_SETS_LOADED"> = {
  id: "mode-sets-actualize",
  description: "When mode-sets are loaded, ensure all mode-sets have valid selection",
  trigger: "MODE_SETS_LOADED",
  condition: () => true,
  apply: (state, cmd) => {
    const ctx = state.persistent.template;
    const provider = state.persistent.providerId;
    const savedModes = state.persistent.modesByContextProvider[ctx]?.[provider] || {};

    // Build complete modes object for ALL available mode-sets
    const actualizedModes: Record<string, string> = {};

    for (const modeSet of cmd.modeSets["mode-sets"]) {
      const savedModeId = savedModes[modeSet.id];
      const modeExists = modeSet.modes.some(m => m.id === savedModeId);

      if (savedModeId && modeExists) {
        // Saved mode is valid - keep it
        actualizedModes[modeSet.id] = savedModeId;
      } else {
        // Saved mode is invalid or missing - select first available
        const defaultMode = modeSet.modes[0];
        if (defaultMode) {
          actualizedModes[modeSet.id] = defaultMode.id;
        }
      }
    }

    return {
      configMutations: { modeSets: cmd.modeSets },
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
};

/**
 * Rule: When tag-sets are loaded, remove invalid saved tags
 */
export const tagSetsActualize: TypedRule<"TAG_SETS_LOADED"> = {
  id: "tag-sets-actualize",
  description: "When tag-sets are loaded, remove invalid saved tags",
  trigger: "TAG_SETS_LOADED",
  condition: () => true,
  apply: (state, cmd) => {
    const ctx = state.persistent.template;
    const savedTags = state.persistent.tagsByContext[ctx] || {};

    // Build set of valid (tagSetId, tagId) pairs
    const validPairs = new Map<string, Set<string>>();
    for (const tagSet of cmd.tagSets["tag-sets"]) {
      validPairs.set(tagSet.id, new Set(tagSet.tags.map(t => t.id)));
    }

    // Validate saved tags
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
      configMutations: { tagSets: cmd.tagSets },
      mutations: hasChanges ? {
        tagsByContext: {
          ...state.persistent.tagsByContext,
          [ctx]: validatedTags
        }
      } : undefined
    };
  }
};

/**
 * Rule: When mode is selected, update persistent state
 */
export const modeSelection: TypedRule<"SELECT_MODE"> = {
  id: "mode-selection",
  description: "When mode is selected, update persistent state",
  trigger: "SELECT_MODE",
  condition: () => true,
  apply: (state, cmd) => {
    const ctx = state.persistent.template;
    const provider = state.persistent.providerId;

    return {
      mutations: {
        modesByContextProvider: {
          ...state.persistent.modesByContextProvider,
          [ctx]: {
            ...state.persistent.modesByContextProvider[ctx],
            [provider]: {
              ...state.persistent.modesByContextProvider[ctx]?.[provider],
              [cmd.modeSetId]: cmd.modeId
            }
          }
        }
      }
    };
  }
};

/**
 * Rule: When tag is toggled, update persistent state
 */
export const tagToggle: TypedRule<"TOGGLE_TAG"> = {
  id: "tag-toggle",
  description: "When tag is toggled, update persistent state",
  trigger: "TOGGLE_TAG",
  condition: () => true,
  apply: (state, cmd) => {
    const ctx = state.persistent.template;
    const currentTags = state.persistent.tagsByContext[ctx] || {};
    const tagsInSet = currentTags[cmd.tagSetId] || [];

    // Toggle tag
    const isCurrentlySelected = tagsInSet.includes(cmd.tagId);
    const newTagsInSet = isCurrentlySelected
      ? tagsInSet.filter(id => id !== cmd.tagId)
      : [...tagsInSet, cmd.tagId];

    // Build new tags object
    const newTags = { ...currentTags };
    if (newTagsInSet.length > 0) {
      newTags[cmd.tagSetId] = newTagsInSet;
    } else {
      delete newTags[cmd.tagSetId];
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
};

/**
 * Rule: When branches are loaded, validate target branch selection
 */
export const branchesLoaded: TypedRule<"BRANCHES_LOADED"> = {
  id: "branches-loaded",
  description: "When branches are loaded, validate target branch selection",
  trigger: "BRANCHES_LOADED",
  condition: () => true,
  apply: (state, cmd) => {
    const branches = cmd.branches;
    const currentBranch = state.persistent.targetBranch;

    // Select best branch: current if valid, then main/master, then first
    const branchSet = new Set(branches);
    const candidates = [currentBranch, "main", "master", "origin/main", "origin/master"];
    const newBranch = candidates.find(b => b && branchSet.has(b)) || branches[0] || "";

    return {
      configMutations: { branches },
      mutations: newBranch !== currentBranch ? { targetBranch: newBranch } : undefined
    };
  }
};

/**
 * Rule: When target branch is selected, update persistent state
 */
export const targetBranchSelection: TypedRule<"SELECT_TARGET_BRANCH"> = {
  id: "target-branch-selection",
  description: "When target branch is selected, update persistent state",
  trigger: "SELECT_TARGET_BRANCH",
  condition: () => true,
  apply: (_state, cmd) => ({
    mutations: { targetBranch: cmd.branch }
  })
};

/**
 * Rule: When section is selected, update persistent state
 */
export const sectionSelection: TypedRule<"SELECT_SECTION"> = {
  id: "section-selection",
  description: "When section is selected, update persistent state",
  trigger: "SELECT_SECTION",
  condition: () => true,
  apply: (_state, cmd) => ({
    mutations: { section: cmd.section }
  })
};

export const adaptiveRules = [
  modeSetsActualize,
  tagSetsActualize,
  modeSelection,
  tagToggle,
  branchesLoaded,
  targetBranchSelection,
  sectionSelection
];

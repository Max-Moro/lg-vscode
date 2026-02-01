/**
 * Adaptive Domain - modes, tags, and target branch (review mode)
 *
 * Commands:
 * - adaptive/SELECT_MODE - select mode in mode-set
 * - adaptive/TOGGLE_TAG - toggle tag selection
 * - adaptive/SELECT_BRANCH - select target branch
 * - adaptive/MODE_SETS_LOADED - mode-sets loaded from CLI
 * - adaptive/TAG_SETS_LOADED - tag-sets loaded from CLI
 * - adaptive/BRANCHES_LOADED - branches loaded from git
 */

import type { BusinessRule, DomainModule, BaseCommand, PCEState } from "../types";
import type { ModeSetsList } from "../../models/mode_sets_list";
import type { TagSetsList } from "../../models/tag_sets_list";

// ============================================
// Commands
// ============================================

export interface SelectModeCmd extends BaseCommand {
  type: "adaptive/SELECT_MODE";
  modeSetId: string;
  modeId: string;
}

export interface ToggleTagCmd extends BaseCommand {
  type: "adaptive/TOGGLE_TAG";
  tagSetId: string;
  tagId: string;
}

export interface SelectBranchCmd extends BaseCommand {
  type: "adaptive/SELECT_BRANCH";
  branch: string;
}

export interface ModeSetsLoadedCmd extends BaseCommand {
  type: "adaptive/MODE_SETS_LOADED";
  modeSets: ModeSetsList;
}

export interface TagSetsLoadedCmd extends BaseCommand {
  type: "adaptive/TAG_SETS_LOADED";
  tagSets: TagSetsList;
}

export interface BranchesLoadedCmd extends BaseCommand {
  type: "adaptive/BRANCHES_LOADED";
  branches: string[];
}

export type AdaptiveCommand =
  | SelectModeCmd
  | ToggleTagCmd
  | SelectBranchCmd
  | ModeSetsLoadedCmd
  | TagSetsLoadedCmd
  | BranchesLoadedCmd;

// ============================================
// Rules
// ============================================

const modeSetsLoaded: BusinessRule = {
  id: "adaptive/mode-sets-loaded",
  description: "When mode-sets are loaded, ensure all mode-sets have valid selection",
  trigger: "adaptive/MODE_SETS_LOADED",
  condition: () => true,
  apply: (state: PCEState, cmd: BaseCommand) => {
    const { modeSets } = cmd as ModeSetsLoadedCmd;
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
        const defaultMode = modeSet.modes[0];
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
};

const tagSetsLoaded: BusinessRule = {
  id: "adaptive/tag-sets-loaded",
  description: "When tag-sets are loaded, remove invalid saved tags",
  trigger: "adaptive/TAG_SETS_LOADED",
  condition: () => true,
  apply: (state: PCEState, cmd: BaseCommand) => {
    const { tagSets } = cmd as TagSetsLoadedCmd;
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
};

const modeSelect: BusinessRule = {
  id: "adaptive/select-mode",
  description: "When mode changes, update persistent state",
  trigger: "adaptive/SELECT_MODE",
  // Only trigger if mode actually changed
  condition: (state: PCEState, cmd: BaseCommand) => {
    const { modeSetId, modeId } = cmd as SelectModeCmd;
    const ctx = state.persistent.template;
    const provider = state.persistent.providerId;
    const currentModeId = state.persistent.modesByContextProvider[ctx]?.[provider]?.[modeSetId];
    return modeId !== currentModeId;
  },
  apply: (state: PCEState, cmd: BaseCommand) => {
    const { modeSetId, modeId } = cmd as SelectModeCmd;
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
              [modeSetId]: modeId
            }
          }
        }
      }
    };
  }
};

const tagToggle: BusinessRule = {
  id: "adaptive/toggle-tag",
  description: "When tag is toggled, update persistent state",
  trigger: "adaptive/TOGGLE_TAG",
  condition: () => true,
  apply: (state: PCEState, cmd: BaseCommand) => {
    const { tagSetId, tagId } = cmd as ToggleTagCmd;
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
};

const branchesLoaded: BusinessRule = {
  id: "adaptive/branches-loaded",
  description: "When branches are loaded, validate target branch selection",
  trigger: "adaptive/BRANCHES_LOADED",
  condition: () => true,
  apply: (state: PCEState, cmd: BaseCommand) => {
    const { branches } = cmd as BranchesLoadedCmd;
    const currentBranch = state.persistent.targetBranch;

    const branchSet = new Set(branches);
    const candidates = [currentBranch, "main", "master", "origin/main", "origin/master"];
    const newBranch = candidates.find(b => b && branchSet.has(b)) || branches[0] || "";

    return {
      configMutations: { branches },
      mutations: newBranch !== currentBranch ? { targetBranch: newBranch } : undefined
    };
  }
};

const branchSelect: BusinessRule = {
  id: "adaptive/select-branch",
  description: "When target branch changes, update persistent state",
  trigger: "adaptive/SELECT_BRANCH",
  // Only trigger if branch actually changed
  condition: (state: PCEState, cmd: BaseCommand) => {
    const { branch } = cmd as SelectBranchCmd;
    return branch !== state.persistent.targetBranch;
  },
  apply: (_state: PCEState, cmd: BaseCommand) => ({
    mutations: { targetBranch: (cmd as SelectBranchCmd).branch }
  })
};

// ============================================
// Domain Module Export
// ============================================

export const adaptiveDomain: DomainModule = {
  id: "adaptive",
  rules: [modeSetsLoaded, tagSetsLoaded, modeSelect, tagToggle, branchesLoaded, branchSelect]
};

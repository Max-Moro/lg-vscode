/**
 * CLI Parameters Builder
 *
 * Pure function to transform PersistentState into CLI generation parameters.
 * Decouples state management from CLI client.
 */

import type { CliGenerationParams } from "./CliClient";
import type { PersistentState } from "../state-lg";
import type { SectionInfo } from "../models/sections_list";

export interface BuildCliParamsOptions {
  includeProvider?: boolean;
  /** Section info for filtering - if provided, filters modes/tags to compatible ones */
  sectionInfo?: SectionInfo;
}

/**
 * Build CLI generation parameters from persistent state.
 *
 * @param state - Persistent state snapshot
 * @param options.includeProvider - Include providerId for context filtering (default: false)
 * @param options.sectionInfo - Section info for filtering modes/tags to compatible ones
 * @returns CLI generation parameters
 */
export function buildCliParams(
  state: PersistentState,
  options?: BuildCliParamsOptions
): CliGenerationParams {
  const ctx = state.template || "";
  const provider = state.providerId || "";

  let modes = state.modesByContextProvider[ctx]?.[provider] ?? {};
  let tags = state.tagsByContext[ctx] ?? {};

  // Filter modes and tags if section info provided
  if (options?.sectionInfo) {
    modes = filterModesForSection(modes, options.sectionInfo);
    tags = filterTagsForSection(tags, options.sectionInfo);
  }

  return {
    tokenizerLib: state.tokenizerLib,
    encoder: state.encoder,
    ctxLimit: state.ctxLimit,
    modes,
    tags,
    taskText: state.taskText,
    targetBranch: state.targetBranch,
    providerId: options?.includeProvider ? provider : undefined
  };
}

/**
 * Filter modes to only include those compatible with the section.
 */
function filterModesForSection(
  modes: Record<string, string>,
  sectionInfo: SectionInfo
): Record<string, string> {
  const compatibleModeSetIds = new Set(sectionInfo["mode-sets"].map(ms => ms.id));

  const filtered: Record<string, string> = {};
  for (const [modeSetId, modeId] of Object.entries(modes)) {
    if (compatibleModeSetIds.has(modeSetId)) {
      filtered[modeSetId] = modeId;
    }
  }
  return filtered;
}

/**
 * Filter tags to only include those compatible with the section.
 */
function filterTagsForSection(
  tags: Record<string, string[]>,
  sectionInfo: SectionInfo
): Record<string, string[]> {
  const compatibleTagSetIds = new Set(sectionInfo["tag-sets"].map(ts => ts.id));

  const filtered: Record<string, string[]> = {};
  for (const [tagSetId, tagIds] of Object.entries(tags)) {
    if (compatibleTagSetIds.has(tagSetId)) {
      filtered[tagSetId] = tagIds;
    }
  }
  return filtered;
}

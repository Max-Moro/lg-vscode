/**
 * CLI Parameters Builder
 *
 * Pure function to transform PersistentState into CLI generation parameters.
 * Decouples state management from CLI client.
 */

import type { CliGenerationParams } from "./CliClient";
import type { PersistentState } from "../state/types";

export interface BuildCliParamsOptions {
  includeProvider?: boolean;
}

/**
 * Build CLI generation parameters from persistent state.
 *
 * @param state - Persistent state snapshot
 * @param options.includeProvider - Include providerId for context filtering (default: false)
 * @returns CLI generation parameters
 */
export function buildCliParams(
  state: PersistentState,
  options?: BuildCliParamsOptions
): CliGenerationParams {
  const ctx = state.template || "";
  const provider = state.providerId || "";

  const modes = state.modesByContextProvider[ctx]?.[provider] ?? {};
  const tags = state.tagsByContext[ctx] ?? {};

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

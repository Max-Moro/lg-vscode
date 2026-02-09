import { cliReport } from "../cli/CliClient";
import { buildCliParams } from "../cli/ParamsBuilder";
import { isContextTarget, extractTargetName } from "../cli/CliTarget";
import type { RunResult } from "../models/report";
import { getStore } from "../bootstrap";

/**
 * Universal service for getting statistics.
 * Works with both sections and contexts.
 */
export class StatsService {
  /**
   * Get statistics for a target (section or context).
   * @param target - CLI target (e.g., "sec:name", "ctx:name", "sec@scope:name")
   * @throws {Error} if CLI unavailable
   */
  async getStats(target: string): Promise<RunResult> {
    const store = getStore();
    const state = store.getState();
    const isContext = isContextTarget(target);

    // For sections, find section info and pass it for filtering
    let sectionInfo;
    if (!isContext) {
      const sectionName = extractTargetName(target);
      sectionInfo = state.configuration.sections.find(s => s.name === sectionName);
    }

    const params = buildCliParams(
      state.persistent,
      { includeProvider: isContext, sectionInfo }
    );

    const result = await cliReport(target, params);
    if (!result) {
      throw new Error("CLI unavailable");
    }
    return result;
  }
}

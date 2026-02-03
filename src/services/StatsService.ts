import { cliReport } from "../cli/CliClient";
import { buildCliParams } from "../cli/ParamsBuilder";
import type { RunResult } from "../models/report";
import { getStore } from "../bootstrap";

/**
 * Universal service for getting statistics.
 * Works with both sections and contexts.
 */
export class StatsService {
  /**
   * Get statistics for a target (section or context).
   * @param target - CLI target in format "sec:name" or "ctx:name"
   * @throws {Error} if CLI unavailable
   */
  async getStats(target: string): Promise<RunResult> {
    const store = getStore();
    const state = store.getState();
    const isContext = target.startsWith("ctx:");

    // For sections, find section info and pass it for filtering
    let sectionInfo;
    if (!isContext) {
      const sectionName = target.replace("sec:", "");
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

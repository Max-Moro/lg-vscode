import { cliReport } from "../cli/CliClient";
import type { RunResult } from "../models/run_result";

export async function runStatsJson(params: { section?: string; model?: string }): Promise<RunResult> {
  const target = params.section ? `sec:${params.section}` : "sec:all";
  return cliReport(target, params.model ?? "o3");
}

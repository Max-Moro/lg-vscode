import { cliReport } from "../cli/CliClient";
import type { RunResult } from "../protocol";

export async function runStatsJson(params: { section?: string; mode?: "all" | "changes"; model?: string }): Promise<RunResult> {
  const target = params.section ? `sec:${params.section}` : "sec:all";
  return cliReport(target, params.model ?? "o3", params.mode);
}

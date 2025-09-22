import { cliReport, type CliOptions } from "../cli/CliClient";
import type { RunResult } from "../models/report";

export interface StatsParams {
  section?: string;
  model?: string;
  modes?: Record<string, string>;
  tags?: string[];
}

export async function runStatsJson(params: StatsParams): Promise<RunResult> {
  const target = params.section ? `sec:${params.section}` : "sec:all";
  const options: CliOptions = {
    model: params.model ?? "o3",
    modes: params.modes,
    tags: params.tags
  };
  return cliReport(target, options);
}

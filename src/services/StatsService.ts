import { cliReport, type CliOptions } from "../cli/CliClient";
import type { RunResult } from "../models/report";

export interface StatsParams {
  section?: string;
  tokenizerLib: string;
  encoder: string;
  ctxLimit: number;
  modes?: Record<string, string>;
  tags?: string[];
  taskText?: string;
  targetBranch?: string;
}

export async function runStatsJson(params: StatsParams): Promise<RunResult> {
  const target = params.section ? `sec:${params.section}` : "sec:all";
  const options: CliOptions = {
    tokenizerLib: params.tokenizerLib,
    encoder: params.encoder,
    ctxLimit: params.ctxLimit,
    modes: params.modes,
    tags: params.tags,
    taskText: params.taskText,
    targetBranch: params.targetBranch
  };
  return cliReport(target, options);
}

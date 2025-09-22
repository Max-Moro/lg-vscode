import { cliRender, cliReport, type CliOptions } from "../cli/CliClient";
import type { RunResult } from "../models/report";

export interface ContextParams {
  template: string;
  model?: string;
  modes?: Record<string, string>;
  tags?: string[];
}

export async function runContext(templateName: string, options: CliOptions = {}): Promise<string> {
  const target = `ctx:${templateName}`;
  return cliRender(target, options);
}

export async function runContextStatsJson(params: ContextParams): Promise<RunResult> {
  const target = `ctx:${params.template}`;
  const options: CliOptions = {
    model: params.model ?? "o3",
    modes: params.modes,
    tags: params.tags
  };
  return cliReport(target, options);
}

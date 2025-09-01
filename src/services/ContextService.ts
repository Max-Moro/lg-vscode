import { cliRender, cliReport } from "../cli/CliClient";
import type { RunResult } from "../protocol";

export async function runContext(templateName: string): Promise<string> {
  const target = `ctx:${templateName}`;
  return cliRender(target);
}

export async function runContextStatsJson(params: { template: string; model?: string }): Promise<RunResult> {
  const target = `ctx:${params.template}`;
  return cliReport(target, params.model ?? "o3");
}

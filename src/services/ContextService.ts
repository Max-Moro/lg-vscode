import { cliRender, cliReport, type CliOptions } from "../cli/CliClient";
import type { RunResult } from "../models/report";

export interface ContextParams {
  template: string;
  tokenizerLib: string;
  encoder: string;
  ctxLimit: number;
  modes?: Record<string, string>;
  tags?: string[];
  taskText?: string;
  targetBranch?: string;
}

export async function runContext(templateName: string, options: CliOptions): Promise<string> {
  const target = `ctx:${templateName}`;
  return cliRender(target, options);
}

export async function runContextStatsJson(params: ContextParams): Promise<RunResult> {
  const target = `ctx:${params.template}`;
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

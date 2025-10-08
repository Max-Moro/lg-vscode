import { cliRender, cliReport, type CliOptions } from "../cli/CliClient";

export interface ListingParams {
  section?: string;
  tokenizerLib: string;
  encoder: string;
  ctxLimit: number;
  modes?: Record<string, string>;
  tags?: string[];
  taskText?: string;
  targetBranch?: string;
}

export async function runListing(params: ListingParams): Promise<string> {
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
  return cliRender(target, options);
}

export async function runListIncludedJson(params: ListingParams): Promise<{ path: string; sizeBytes: number }[]> {
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
  const data = await cliReport(target, options);
  const files = Array.isArray(data.files) ? data.files : [];
  return files.map((f: any) => ({ path: f.path, sizeBytes: f.sizeBytes ?? 0 }));
}

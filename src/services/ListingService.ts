import { cliRender, cliReport } from "../cli/CliClient";

export async function runListing(params: { section?: string; mode?: "all" | "changes" }): Promise<string> {
  const target = params.section ? `sec:${params.section}` : "sec:all";
  return cliRender(target, { mode: params.mode });
}

export async function runListIncludedJson(params: { section?: string; mode?: "all" | "changes" }): Promise<{ path: string; sizeBytes: number }[]> {
  const target = params.section ? `sec:${params.section}` : "sec:all";
  const data = await cliReport(target, "o3", params.mode);
  const files = Array.isArray(data.files) ? data.files : [];
  return files.map((f: any) => ({ path: f.path, sizeBytes: f.sizeBytes ?? 0 }));
}

import { cliRender, cliReport } from "../cli/CliClient";

export async function runListing(params: { section?: string }): Promise<string> {
  const target = params.section ? `sec:${params.section}` : "sec:all";
  return cliRender(target);
}

export async function runListIncludedJson(params: { section?: string; model?: string }): Promise<{ path: string; sizeBytes: number }[]> {
  const target = params.section ? `sec:${params.section}` : "sec:all";
  const data = await cliReport(target, params.model ?? "o3");
  const files = Array.isArray(data.files) ? data.files : [];
  return files.map((f: any) => ({ path: f.path, sizeBytes: f.sizeBytes ?? 0 }));
}

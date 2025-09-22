import { runCli } from "./CliResolver";
import type { RunResult } from "../models/report";
import type { DiagReport } from "../models/diag_report";

export interface CliOptions {
  model?: string;
  modes?: Record<string, string>; // modeset -> mode
  tags?: string[]; // active tags
}

export async function cliRender(target: string, options: CliOptions = {}): Promise<string> {
  const args: string[] = ["render", target];
  
  if (options.model) {
    args.push("--model", options.model);
  }
  
  if (options.modes) {
    for (const [modeset, mode] of Object.entries(options.modes)) {
      if (mode) {
        args.push("--mode", `${modeset}:${mode}`);
      }
    }
  }
  
  if (options.tags && options.tags.length > 0) {
    args.push("--tags", options.tags.join(","));
  }
  
  return runCli(args, { timeoutMs: 120_000 });
}

export async function cliReport(target: string, options: CliOptions = {}): Promise<RunResult> {
  const args: string[] = ["report", target];
  
  if (options.model) {
    args.push("--model", options.model);
  }
  
  if (options.modes) {
    for (const [modeset, mode] of Object.entries(options.modes)) {
      if (mode) {
        args.push("--mode", `${modeset}:${mode}`);
      }
    }
  }
  
  if (options.tags && options.tags.length > 0) {
    args.push("--tags", options.tags.join(","));
  }
  
  const out = await runCli(args, { timeoutMs: 120_000 });
  const data = JSON.parse(out);
  return data as RunResult;
}

export async function cliList(what: "sections" | "contexts" | "models" | "mode-sets" | "tag-sets") {
  const out = await runCli(["list", what], { timeoutMs: 20_000 });
  const data = JSON.parse(out);
  
  // For the new commands, return the full object structure
  if (what === "mode-sets" || what === "tag-sets") {
    return data;
  }
  
  // For legacy commands, extract the array
  return data?.[what] ?? data ?? [];
}

export async function cliDiag(rebuild?: boolean): Promise<DiagReport> {
  const args = ["diag"].concat(rebuild ? ["--rebuild-cache"] : []);
  const out = await runCli(args, { timeoutMs: rebuild ? 60_000 : 20_000 });
  const data = JSON.parse(out);
  return data as DiagReport;
}

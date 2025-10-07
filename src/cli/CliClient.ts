import { runCli } from "./CliResolver";
import type { RunResult } from "../models/report";
import type { DiagReport } from "../models/diag_report";

export interface CliOptions {
  model?: string;
  modes?: Record<string, string>; // modeset -> mode
  tags?: string[]; // active tags
  taskText?: string; // text of the current task
  targetBranch?: string; // target branch for review mode
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
  
  if (options.targetBranch && options.targetBranch.trim()) {
    args.push("--target-branch", options.targetBranch.trim());
  }
  
  // Task text всегда через stdin (если не пустой)
  let stdinData: string | undefined;
  if (options.taskText && options.taskText.trim()) {
    args.push("--task", "-");
    stdinData = options.taskText.trim();
  }
  
  return runCli(args, { timeoutMs: 120_000, stdinData });
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
  
  if (options.targetBranch && options.targetBranch.trim()) {
    args.push("--target-branch", options.targetBranch.trim());
  }
  
  // Task text всегда через stdin (если не пустой)
  let stdinData: string | undefined;
  if (options.taskText && options.taskText.trim()) {
    args.push("--task", "-");
    stdinData = options.taskText.trim();
  }
  
  const out = await runCli(args, { timeoutMs: 120_000, stdinData });
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

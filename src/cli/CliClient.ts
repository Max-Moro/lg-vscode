import { runCli } from "./CliResolver";
import type { RunResult } from "../models/report";
import type { DiagReport } from "../models/diag_report";
import { CliException } from "./CliException";
import { logDebug } from "../logging/log";

/**
 * Parameters for CLI generation commands.
 * Extracted from state to support context-dependent storage.
 */
export interface CliGenerationParams {
  tokenizerLib: string;
  encoder: string;
  ctxLimit: number;
  modes: Record<string, string>;        // modeSetId -> modeId
  tags: Record<string, string[]>;       // tagSetId -> [tagId, ...]
  taskText?: string;
  targetBranch?: string;
}

/**
 * Internal function to build CLI arguments for render/report commands.
 *
 * @param command - CLI command ("render" or "report")
 * @param target - target (e.g., "ctx:name" or "sec:name")
 * @param params - CLI generation parameters
 * @returns object with args and stdinData to pass to runCli
 */
function buildCliArgs(command: string, target: string, params: CliGenerationParams): { args: string[]; stdinData?: string } {
  const args: string[] = [command, target];

  // Required tokenization parameters
  args.push("--lib", params.tokenizerLib);
  args.push("--encoder", params.encoder);
  args.push("--ctx-limit", String(params.ctxLimit));

  // Modes
  for (const [modeset, mode] of Object.entries(params.modes)) {
    if (mode) {
      args.push("--mode", `${modeset}:${mode}`);
    }
  }

  // Tags (flatten from Record<tagSetId, tagId[]> to flat list)
  const flatTags: string[] = [];
  for (const tagIds of Object.values(params.tags)) {
    flatTags.push(...tagIds);
  }
  if (flatTags.length > 0) {
    args.push("--tags", flatTags.join(","));
  }

  // Target branch (for review mode)
  if (params.targetBranch && params.targetBranch.trim()) {
    args.push("--target-branch", params.targetBranch.trim());
  }

  // Task text (pass via stdin)
  let stdinData: string | undefined;
  if (params.taskText && params.taskText.trim()) {
    args.push("--task", "-");
    stdinData = params.taskText.trim();
  }

  return { args, stdinData };
}

export async function cliRender(target: string, params: CliGenerationParams): Promise<string> {
  const { args, stdinData } = buildCliArgs("render", target, params);
  return runCli(args, { timeoutMs: 120_000, stdinData });
}

export async function cliReport(target: string, params: CliGenerationParams): Promise<RunResult> {
  const { args, stdinData } = buildCliArgs("report", target, params);
  const out = await runCli(args, { timeoutMs: 120_000, stdinData });
  const data = JSON.parse(out);
  return data as RunResult;
}

export async function cliList(what: "sections" | "contexts" | "mode-sets" | "tag-sets") {
  try {
    const out = await runCli(["list", what], { timeoutMs: 20_000 });
    const data = JSON.parse(out);

    if (what === "mode-sets" || what === "tag-sets") {
      return data;
    }

    return data?.[what] ?? data ?? [];
  } catch (e) {
    if (e instanceof CliException && e.silent) {
      logDebug(`[cliList] Silent failure: ${e.message}`);
      // Return appropriate empty structure
      if (what === "mode-sets") {
        return { "mode-sets": [] };
      } else if (what === "tag-sets") {
        return { "tag-sets": [] };
      } else {
        return [];
      }
    }
    throw e;
  }
}

export async function cliDiag(rebuild?: boolean): Promise<DiagReport> {
  const args = ["diag"].concat(rebuild ? ["--rebuild-cache"] : []);
  const out = await runCli(args, { timeoutMs: rebuild ? 60_000 : 20_000 });
  const data = JSON.parse(out);
  return data as DiagReport;
}

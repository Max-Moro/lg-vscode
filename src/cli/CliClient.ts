import { runCli } from "./CliResolver";
import type { RunResult } from "../models/report";
import type { DiagReport } from "../models/diag_report";
import type { ModeSetsList } from "../models/mode_sets_list";
import type { TagSetsList } from "../models/tag_sets_list";
import type { SectionsList, SectionInfo } from "../models/sections_list";
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
  providerId?: string;
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

  // Provider (for template conditions)
  if (params.providerId && params.providerId.trim()) {
    args.push("--provider", params.providerId.trim());
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

/**
 * List sections from CLI with their compatible mode-sets and tag-sets.
 * @param context - Optional context name to filter sections
 */
export async function cliListSections(context?: string): Promise<SectionInfo[]> {
  try {
    const args = ["list", "sections"];
    if (context && context.trim()) {
      args.push("--context", context.trim());
    }
    const out = await runCli(args, { timeoutMs: 20_000 });
    const data = JSON.parse(out) as SectionsList;
    return data?.sections ?? [];
  } catch (e) {
    if (e instanceof CliException && e.silent) {
      logDebug(`[cliListSections] Silent failure: ${e.message}`);
      return [];
    }
    throw e;
  }
}

/**
 * List contexts with optional provider filter.
 * @param provider - Optional provider ID to filter contexts
 */
export async function cliListContexts(provider?: string): Promise<string[]> {
  try {
    const args = ["list", "contexts"];
    if (provider && provider.trim()) {
      args.push("--provider", provider.trim());
    }
    const out = await runCli(args, { timeoutMs: 20_000 });
    const data = JSON.parse(out);
    return data?.contexts ?? [];
  } catch (e) {
    if (e instanceof CliException && e.silent) {
      logDebug(`[cliListContexts] Silent failure: ${e.message}`);
      return [];
    }
    throw e;
  }
}

/**
 * List mode-sets for specific context and provider.
 * @param context - Context name
 * @param provider - Provider ID
 */
export async function cliListModeSets(context: string, provider: string): Promise<ModeSetsList> {
  try {
    const args = ["list", "mode-sets", "--context", context, "--provider", provider];
    const out = await runCli(args, { timeoutMs: 20_000 });
    const data = JSON.parse(out);
    return data as ModeSetsList;
  } catch (e) {
    if (e instanceof CliException && e.silent) {
      logDebug(`[cliListModeSets] Silent failure: ${e.message}`);
      return { "mode-sets": [] };
    }
    throw e;
  }
}

/**
 * List tag-sets for specific context.
 * @param context - Context name
 */
export async function cliListTagSets(context: string): Promise<TagSetsList> {
  try {
    const args = ["list", "tag-sets", "--context", context];
    const out = await runCli(args, { timeoutMs: 20_000 });
    const data = JSON.parse(out);
    return data as TagSetsList;
  } catch (e) {
    if (e instanceof CliException && e.silent) {
      logDebug(`[cliListTagSets] Silent failure: ${e.message}`);
      return { "tag-sets": [] };
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

/**
 * List available tokenizer libraries.
 */
export async function cliListTokenizerLibs(): Promise<string[]> {
  const out = await runCli(["list", "tokenizer-libs"], { timeoutMs: 20_000 });
  const data = JSON.parse(out);
  return Array.isArray(data?.tokenizer_libs) ? data.tokenizer_libs : [];
}

/**
 * Encoder entry with optional cached flag.
 */
export interface EncoderEntry {
  name: string;
  cached?: boolean;
}

/**
 * List encoders for a specific tokenizer library.
 * @param lib - Tokenizer library name
 */
export async function cliListEncoders(lib: string): Promise<EncoderEntry[]> {
  const out = await runCli(["list", "encoders", "--lib", lib], { timeoutMs: 20_000 });
  const data = JSON.parse(out);

  if (!data || !Array.isArray(data.encoders)) {
    return [];
  }

  return data.encoders.map((e: string | { name: string; cached?: boolean }) =>
    typeof e === "string" ? { name: e } : e
  );
}

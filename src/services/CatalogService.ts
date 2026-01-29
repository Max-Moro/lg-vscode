import { cliListSections, cliListContexts, cliListModeSets, cliListTagSets } from "../cli/CliClient";
import { runCli } from "../cli/CliResolver";
import type { ModeSetsList } from "../models/mode_sets_list";
import type { TagSetsList } from "../models/tag_sets_list";

export async function listSectionsJson(): Promise<string[]> {
  return cliListSections();
}

export async function listContextsJson(provider?: string): Promise<string[]> {
  return cliListContexts(provider);
}

export interface EncoderEntry {
  name: string;
  cached?: boolean;
}

export async function listTokenizerLibsJson(): Promise<string[]> {
  const out = await runCli(["list", "tokenizer-libs"], { timeoutMs: 20_000 });
  const data = JSON.parse(out);
  return Array.isArray(data?.tokenizer_libs) ? data.tokenizer_libs : [];
}

export async function listEncodersJson(lib: string): Promise<EncoderEntry[]> {
  const out = await runCli(["list", "encoders", "--lib", lib], { timeoutMs: 20_000 });
  const data = JSON.parse(out);
  
  if (!data || !Array.isArray(data.encoders)) {
    return [];
  }
  
  return data.encoders.map((e: string | { name: string; cached?: boolean }) => 
    typeof e === "string" ? { name: e } : e
  );
}

export async function listModeSetsJson(context: string, provider: string): Promise<ModeSetsList> {
  return cliListModeSets(context, provider);
}

export async function listTagSetsJson(context: string): Promise<TagSetsList> {
  return cliListTagSets(context);
}

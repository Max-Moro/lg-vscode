import { cliList } from "../cli/CliClient";
import { runCli } from "../cli/CliResolver";
import type { ModeSetsList } from "../models/mode_sets_list";
import type { TagSetsList } from "../models/tag_sets_list";

export async function listSectionsJson(): Promise<string[]> {
  const list = await cliList("sections");
  return Array.isArray(list) ? (list as string[]) : [];
}

export async function listContextsJson(): Promise<string[]> {
  const list = await cliList("contexts");
  return Array.isArray(list) ? (list as string[]) : [];
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

export async function listModeSetsJson(): Promise<ModeSetsList> {
  const data = await cliList("mode-sets");
  return data as ModeSetsList;
}

export async function listTagSetsJson(): Promise<TagSetsList> {
  const data = await cliList("tag-sets");
  return data as TagSetsList;
}

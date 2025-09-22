import { cliList } from "../cli/CliClient";
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

export type ModelEntry = {
  id: string;
  label: string;
  base: string;
  plan: string | null;
  provider: string;
  encoder: string;
  ctxLimit: number;
};

export async function listModelsJson(): Promise<ModelEntry[]> {
  const list = await cliList("models");
  return Array.isArray(list) ? (list as ModelEntry[]) : [];
}

export async function listModeSetsJson(): Promise<ModeSetsList> {
  const data = await cliList("mode-sets");
  return data as ModeSetsList;
}

export async function listTagSetsJson(): Promise<TagSetsList> {
  const data = await cliList("tag-sets");
  return data as TagSetsList;
}

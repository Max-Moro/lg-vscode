import { cliList } from "../cli/CliClient";

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

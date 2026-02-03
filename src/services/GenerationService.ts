import { cliRender } from "../cli/CliClient";
import { buildCliParams } from "../cli/ParamsBuilder";
import { getStore } from "../bootstrap";

/**
 * Universal service for content generation.
 * Works with both sections and contexts.
 */
export class GenerationService {
  /**
   * Generate content for a target (section or context).
   * @param target - CLI target in format "sec:name" or "ctx:name"
   * @returns Generated content as string
   */
  async generate(target: string): Promise<string> {
    const store = getStore();
    const isContext = target.startsWith("ctx:");
    const params = buildCliParams(store.getPersistentState(), { includeProvider: isContext });

    return cliRender(target, params);
  }
}

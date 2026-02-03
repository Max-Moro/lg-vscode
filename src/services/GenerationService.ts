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
    const state = store.getState();
    const isContext = target.startsWith("ctx:");

    // For sections, find section info and pass it for filtering
    let sectionInfo;
    if (!isContext) {
      const sectionName = target.replace("sec:", "");
      sectionInfo = state.configuration.sections.find(s => s.name === sectionName);
    }

    const params = buildCliParams(
      state.persistent,
      { includeProvider: isContext, sectionInfo }
    );

    return cliRender(target, params);
  }
}

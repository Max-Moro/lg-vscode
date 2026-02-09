import { cliRender } from "../cli/CliClient";
import { buildCliParams } from "../cli/ParamsBuilder";
import { isContextTarget, extractTargetName } from "../cli/CliTarget";
import { getStore } from "../bootstrap";

/**
 * Universal service for content generation.
 * Works with both sections and contexts.
 */
export class GenerationService {
  /**
   * Generate content for a target (section or context).
   * @param target - CLI target (e.g., "sec:name", "ctx:name", "sec@scope:name")
   * @returns Generated content as string
   */
  async generate(target: string): Promise<string> {
    const store = getStore();
    const state = store.getState();
    const isContext = isContextTarget(target);

    // For sections, find section info and pass it for filtering
    let sectionInfo;
    if (!isContext) {
      const sectionName = extractTargetName(target);
      sectionInfo = state.configuration.sections.find(s => s.name === sectionName);
    }

    const params = buildCliParams(
      state.persistent,
      { includeProvider: isContext, sectionInfo }
    );

    return cliRender(target, params);
  }
}

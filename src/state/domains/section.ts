/**
 * Section Domain - section selection for inspection
 */

import { command, rule, type PCEState } from "../types";
import type { SectionInfo } from "../../models/sections_list";

// ============================================
// Commands
// ============================================

export const SelectSection = command("section/SELECT").payload<{ section: string }>();
export const SectionsLoaded = command("section/LOADED").payload<{ sections: SectionInfo[] }>();

// ============================================
// Rules
// ============================================

/** When sections are loaded, store them and validate selection */
rule(SectionsLoaded, {
  condition: () => true,
  apply: (state: PCEState, cmd) => {
    const { sections } = cmd;
    const currentSection = state.persistent.section;

    // Validate against section names
    const sectionNames = sections.map(s => s.name);
    const isValid = currentSection && sectionNames.includes(currentSection);
    const newSection = isValid ? currentSection : (sectionNames[0] || "");

    return {
      configMutations: { sections },
      mutations: currentSection !== newSection ? { section: newSection } : undefined
    };
  }
});

/** When section changes, update persistent state */
rule(SelectSection, {
  condition: (state: PCEState, cmd) => {
    return cmd.section !== state.persistent.section;
  },
  apply: (_state: PCEState, cmd) => ({
    mutations: { section: cmd.section }
  })
});

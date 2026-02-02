/**
 * Section Domain - section selection for inspection
 */

import { command, rule, type PCEState } from "../types";

// ============================================
// Commands
// ============================================

export const SelectSection = command("section/SELECT").payload<{ section: string }>();
export const SectionsLoaded = command("section/LOADED").payload<{ sections: string[] }>();

// ============================================
// Rules
// ============================================

/** When sections are loaded, store them and validate selection */
rule(SectionsLoaded, {
  condition: () => true,
  apply: (state: PCEState, cmd) => {
    const { sections } = cmd;
    const currentSection = state.persistent.section;

    const isValid = currentSection && sections.includes(currentSection);
    const newSection = isValid ? currentSection : (sections[0] || "");

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

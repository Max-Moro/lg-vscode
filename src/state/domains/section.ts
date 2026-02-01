/**
 * Section Domain - section selection for inspection
 *
 * Commands:
 * - section/SELECT - select section
 * - section/LOADED - sections list loaded from CLI
 */

import type { BusinessRule, DomainModule, BaseCommand, PCEState } from "../types";

// ============================================
// Commands
// ============================================

export interface SelectSectionCmd extends BaseCommand {
  type: "section/SELECT";
  section: string;
}

export interface SectionsLoadedCmd extends BaseCommand {
  type: "section/LOADED";
  sections: string[];
}

export type SectionCommand = SelectSectionCmd | SectionsLoadedCmd;

// ============================================
// Rules
// ============================================

const sectionsLoaded: BusinessRule = {
  id: "section/loaded",
  description: "When sections are loaded, store them and validate selection",
  trigger: "section/LOADED",
  condition: () => true,
  apply: (state: PCEState, cmd: BaseCommand) => {
    const { sections } = cmd as SectionsLoadedCmd;
    const currentSection = state.persistent.section;

    const isValid = currentSection && sections.includes(currentSection);
    const newSection = isValid ? currentSection : (sections[0] || "");

    return {
      configMutations: { sections },
      mutations: currentSection !== newSection ? { section: newSection } : undefined
    };
  }
};

const sectionSelect: BusinessRule = {
  id: "section/select",
  description: "When section changes, update persistent state",
  trigger: "section/SELECT",
  // Only trigger if section actually changed
  condition: (state: PCEState, cmd: BaseCommand) => {
    const { section } = cmd as SelectSectionCmd;
    return section !== state.persistent.section;
  },
  apply: (_state: PCEState, cmd: BaseCommand) => ({
    mutations: { section: (cmd as SelectSectionCmd).section }
  })
};

// ============================================
// Domain Module Export
// ============================================

export const sectionDomain: DomainModule = {
  id: "section",
  rules: [sectionsLoaded, sectionSelect]
};

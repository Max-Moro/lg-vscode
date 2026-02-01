/**
 * Central point for registering all AI providers
 */
import * as clipboard from "./providers/clipboard";
import * as copilot from "./providers/copilot";
import * as cursor from "./providers/cursor";
import * as claudeCli from "./providers/claude-cli";
import * as codexCli from "./providers/codex-cli";

// Settings modules
import { claudeCliSettings } from "./providers/claude-cli/settings";
import { codexCliSettings } from "./providers/codex-cli/settings";

import { AiIntegrationService } from "./AiIntegrationService";
import type { ProviderModule, ProviderSettingsModule } from "./types";
import { registerRules } from "../../state/domains";

// List of all providers
const ALL_PROVIDERS: ProviderModule[] = [
  clipboard,
  copilot,
  cursor,
  claudeCli,
  codexCli,
];

// List of all settings modules
const ALL_SETTINGS_MODULES: ProviderSettingsModule[] = [
  claudeCliSettings,
  codexCliSettings,
];

/**
 * Initialize AI Integration Service
 */
export function createAiIntegrationService(): AiIntegrationService {
  const service = new AiIntegrationService();

  // Register all providers
  for (const provider of ALL_PROVIDERS) {
    service.registerProvider(provider);
  }

  // Register settings modules
  for (const settings of ALL_SETTINGS_MODULES) {
    service.registerSettingsModule(settings);
    // Register rules from settings module
    registerRules(settings.rules);
  }

  return service;
}

export { AiIntegrationService } from "./AiIntegrationService";
export type { AiProvider, ProviderDetector, ProviderModule, ProviderSettingsModule } from "./types";
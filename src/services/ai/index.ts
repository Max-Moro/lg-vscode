/**
 * Central point for registering all AI providers
 */
import * as vscode from "vscode";
import * as clipboard from "./providers/clipboard";
import * as copilot from "./providers/copilot";
import * as cursor from "./providers/cursor";
import * as claudeCli from "./providers/claude-cli";
import * as openai from "./providers/openai";

import { AiIntegrationService } from "./AiIntegrationService";
import type { ProviderModule } from "./types";

// List of all providers
const ALL_PROVIDERS: ProviderModule[] = [
  clipboard,
  copilot,
  cursor,
  claudeCli,
  openai,
];

/**
 * Initialize AI Integration Service
 */
export function createAiIntegrationService(context: vscode.ExtensionContext): AiIntegrationService {
  const service = new AiIntegrationService(context);

  // Register all providers
  for (const provider of ALL_PROVIDERS) {
    service.registerProvider(provider);
  }

  return service;
}

export { AiIntegrationService } from "./AiIntegrationService";
export type { AiProvider, ProviderDetector, ProviderModule } from "./types";
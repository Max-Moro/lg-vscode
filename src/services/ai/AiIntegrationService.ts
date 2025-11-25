import * as vscode from "vscode";
import type { ProviderModule } from "./types";
import { logInfo, logDebug, logError } from "../../logging/log";
import { ControlStateService } from "../ControlStateService";

/**
 * Central service for managing AI providers
 */
export class AiIntegrationService {
  private providers = new Map<string, ProviderModule>();
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Register a provider
   */
  registerProvider(module: ProviderModule): void {
    this.providers.set(module.provider.id, module);
    logDebug(`AI Provider registered: ${module.provider.id} (priority: ${module.detector.priority})`);
  }

  /**
   * Initial detection of available providers
   * Called once when the extension is activated
   */
  async detectBestProvider(): Promise<string> {
    const available: Array<{ id: string; priority: number }> = [];

    for (const [id, module] of this.providers) {
      try {
        const isAvailable = await module.detector.detect();
        if (isAvailable) {
          available.push({ id, priority: module.detector.priority });
          logDebug(`Provider ${id} is available (priority: ${module.detector.priority})`);
        }
      } catch (e) {
        logError(`Failed to detect provider ${id}`, e);
      }
    }

    if (available.length === 0) {
      logInfo("No AI providers detected, falling back to clipboard");
      return "clipboard";
    }

    // Sort by priority in descending order
    available.sort((a, b) => b.priority - a.priority);

    const best = available[0];
    logInfo(`Best AI provider detected: ${best.id} (priority: ${best.priority})`);

    return best.id;
  }

  /**
   * Get provider name by ID
   */
  getProviderName(id: string): string {
    return this.providers.get(id)?.provider.name ?? id;
  }

  /**
   * Send content to the specified provider with automatic mode detection.
   *
   * @param providerId - Provider ID
   * @param content - Content to send
   */
  async sendToProvider(providerId: string, content: string): Promise<void> {
    const module = this.providers.get(providerId);

    if (!module) {
      throw new Error(`Provider '${providerId}' not found`);
    }

    // Automatically detect mode from panel state
    const mode = ControlStateService.getInstance(this.context).getAiInteractionMode();

    logInfo(`Sending content to provider: ${providerId} (mode: ${mode})`);

    try {
      // Set context for providers that require it
      const provider = module.provider as { setContext?: (context: vscode.ExtensionContext) => void };
      if (provider.setContext) {
        provider.setContext(this.context);
      }

      await module.provider.send(content, mode);
      logInfo(`Successfully sent content to ${providerId}`);
    } catch (e) {
      logError(`Failed to send content to ${providerId}`, e);
      throw e;
    }
  }

  /**
   * General method for generating and sending content to an AI provider
   * with full error handling and UI interaction
   *
   * @param generateContent - Function to generate content (asynchronous)
   * @param generateTitle - Title for the generation progress bar (optional)
   * @returns true if sending is successful, false if cancelled
   */
  async generateAndSend(
    generateContent: () => Promise<string>,
    generateTitle?: string
  ): Promise<boolean> {
    // 1. Check for a configured provider
    const config = vscode.workspace.getConfiguration();
    const providerId = config.get<string>("lg.ai.provider");

    if (!providerId) {
      const choice = await vscode.window.showErrorMessage(
        "No AI provider configured.",
        "Open Settings",
        "Cancel"
      );

      if (choice === "Open Settings") {
        vscode.commands.executeCommand("workbench.action.openSettings", "lg.ai.provider");
      }
      return false;
    }

    let generatedContent: string | undefined;

    try {
      // 2. Generate content with progress bar
      generatedContent = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: generateTitle || "LG: Generating content...",
          cancellable: false
        },
        generateContent
      );

      // 3. Send to AI provider
      const providerName = this.getProviderName(providerId);

      if (generatedContent) {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Sending to ${providerName}...`,
            cancellable: false
          },
          () => this.sendToProvider(providerId, generatedContent as string)
        );
      }

      return true;
    } catch (error) {
      // 4. Error handling with recovery options
      const providerName = this.getProviderName(providerId);

      const errorMessage = error instanceof Error ? error.message : String(error);
      const options = generatedContent
        ? ["Open Settings", "Copy to Clipboard", "Cancel"]
        : ["Open Settings", "Cancel"];

      const choice = await vscode.window.showErrorMessage(
        `Failed to send to ${providerName}: ${errorMessage}`,
        ...options
      );

      if (choice === "Open Settings") {
        vscode.commands.executeCommand("workbench.action.openSettings", "lg.ai.provider");
      } else if (choice === "Copy to Clipboard" && generatedContent) {
        // Fallback to clipboard in case of error
        await this.sendToProvider("clipboard", generatedContent);
      }

      return false;
    }
  }
}
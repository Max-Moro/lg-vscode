import * as vscode from "vscode";
import type { ProviderModule, ProviderModeInfo } from "./types";
import { logInfo, logDebug, logError } from "../../logging/log";

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
   * Get list of all registered providers for UI display.
   * Returns providers sorted by priority (descending).
   */
  getRegisteredProviders(): Array<{ id: string; name: string; priority: number }> {
    const result: Array<{ id: string; name: string; priority: number }> = [];

    for (const [id, module] of this.providers) {
      result.push({
        id,
        name: module.provider.name,
        priority: module.detector.priority
      });
    }

    // Sort by priority descending
    result.sort((a, b) => b.priority - a.priority);

    return result;
  }

  /**
   * Detect available providers in the current environment.
   * Checks each provider's detector and returns only available ones.
   * Returns providers sorted by priority (descending).
   */
  async detectAvailableProviders(): Promise<Array<{ id: string; name: string; priority: number }>> {
    const available: Array<{ id: string; name: string; priority: number }> = [];

    for (const [id, module] of this.providers) {
      try {
        const isAvailable = await module.detector.detect();
        if (isAvailable) {
          available.push({
            id,
            name: module.provider.name,
            priority: module.detector.priority
          });
          logDebug(`Provider ${id} is available (priority: ${module.detector.priority})`);
        } else {
          logDebug(`Provider ${id} is not available`);
        }
      } catch (e) {
        logError(`Failed to detect provider ${id}`, e);
      }
    }

    // Sort by priority descending
    available.sort((a, b) => b.priority - a.priority);

    logInfo(`Detected ${available.length} available providers: ${available.map(p => p.id).join(", ")}`);
    return available;
  }

  /**
   * Get all supported modes from all providers.
   * Used for generating ai-interaction.sec.yaml
   *
   * @returns Map of modeId to Map of providerId to runs string
   */
  getAllSupportedModes(): Map<string, Map<string, string>> {
    const allModes = new Map<string, Map<string, string>>();

    for (const [providerId, module] of this.providers) {
      const supportedModes = module.provider.getSupportedModes();
      for (const { modeId, runs } of supportedModes) {
        if (!allModes.has(modeId)) {
          allModes.set(modeId, new Map());
        }
        allModes.get(modeId)!.set(providerId, runs);
      }
    }

    return allModes;
  }

  /**
   * Send content to the specified provider.
   *
   * @param providerId - Provider ID
   * @param content - Content to send
   * @param runs - Provider-specific runs configuration string
   */
  async sendToProvider(providerId: string, content: string, runs: string): Promise<void> {
    const module = this.providers.get(providerId);

    if (!module) {
      throw new Error(`Provider '${providerId}' not found`);
    }

    logInfo(`Sending content to provider: ${providerId} (runs: ${runs || '(empty)'})`);

    try {
      // Set context for providers that require it
      const provider = module.provider as { setContext?: (context: vscode.ExtensionContext) => void };
      if (provider.setContext) {
        provider.setContext(this.context);
      }

      await module.provider.send(content, runs);
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
   * @param providerId - Provider ID to send to
   * @param runs - Provider-specific runs string
   * @param generateTitle - Title for the generation progress bar (optional)
   * @returns true if sending is successful, false if cancelled
   */
  async generateAndSend(
    generateContent: () => Promise<string>,
    providerId: string,
    runs: string,
    generateTitle?: string
  ): Promise<boolean> {
    if (!providerId) {
      vscode.window.showErrorMessage(
        "No AI provider selected. Please select a provider in the Control Panel."
      );
      return false;
    }

    let generatedContent: string | undefined;

    try {
      // Generate content with progress bar
      generatedContent = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: generateTitle || "LG: Generating content...",
          cancellable: false
        },
        generateContent
      );

      // Send to AI provider
      const providerName = this.getProviderName(providerId);

      if (generatedContent) {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Sending to ${providerName}...`,
            cancellable: false
          },
          () => this.sendToProvider(providerId, generatedContent as string, runs)
        );
      }

      return true;
    } catch (error) {
      // Error handling with recovery options
      const providerName = this.getProviderName(providerId);

      const errorMessage = error instanceof Error ? error.message : String(error);
      const options = generatedContent
        ? ["Copy to Clipboard", "Cancel"]
        : ["Cancel"];

      const choice = await vscode.window.showErrorMessage(
        `Failed to send to ${providerName}: ${errorMessage}`,
        ...options
      );

      if (choice === "Copy to Clipboard" && generatedContent) {
        // Fallback to clipboard in case of error
        await this.sendToProvider("clipboard", generatedContent, "");
      }

      return false;
    }
  }
}

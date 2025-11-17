import * as vscode from "vscode";
import { BaseAiProvider } from "./BaseAiProvider";
import type { AiInteractionMode } from "../../../models/AiInteractionMode";

/**
 * Base class for Extension-based providers
 *
 * Used for providers that work through other VS Code extensions
 * (e.g., GitHub Copilot).
 *
 * Main capabilities:
 * - Automatic extension activation when needed
 * - Extension availability check
 * - Handling missing extension errors
 */
export abstract class BaseExtensionProvider extends BaseAiProvider {
  protected abstract extensionId: string;

  /**
   * Check extension activity and activate it if needed
   * @throws Error if extension is not found
   */
  protected async ensureExtensionActive(): Promise<void> {
    const ext = vscode.extensions.getExtension(this.extensionId);
    if (!ext) {
      throw new Error(`Extension ${this.extensionId} not found`);
    }
    if (!ext.isActive) {
      await ext.activate();
    }
  }

  /**
   * Send content through the extension
   * First checks and activates the extension, then calls sendToExtension
   */
  async send(content: string, mode: AiInteractionMode): Promise<void> {
    await this.ensureExtensionActive();
    await this.sendToExtension(content, mode);
  }

  /**
   * Method to send content to a specific extension.
   * Implemented by subclasses for provider-specific interaction logic.
   *
   * @param content - Content to send
   * @param mode - AI interaction mode
   */
  protected abstract sendToExtension(content: string, mode: AiInteractionMode): Promise<void>;
}

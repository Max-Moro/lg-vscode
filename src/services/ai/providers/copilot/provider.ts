import * as vscode from "vscode";
import { BaseExtensionProvider } from "../../base";
import type { AiInteractionMode } from "../../../../models/AiInteractionMode";

export class CopilotProvider extends BaseExtensionProvider {
  readonly id = "github.copilot";
  readonly name = "GitHub Copilot Chat";
  protected extensionId = "GitHub.copilot-chat";

  /**
   * Checks and sets the chat.implicitContext.enabled = { panel: "never" } setting
   * if it is not set to this value.
   */
  private async ensureImplicitContextDisabled(): Promise<void> {
    const config = vscode.workspace.getConfiguration();
    const currentValue = config.get<{ panel?: string }>("chat.implicitContext.enabled");

    // Check if the setting is correctly configured
    if (currentValue?.panel === "never") {
      return; // Setting is already correct
    }

    // Set the required value in global settings
    await config.update(
      "chat.implicitContext.enabled",
      { panel: "never" },
      vscode.ConfigurationTarget.Global
    );
  }

  protected async sendToExtension(content: string, mode: AiInteractionMode): Promise<void> {
    // Ensure that implicit context is disabled
    await this.ensureImplicitContextDisabled();

    // Create a new chat
    await vscode.commands.executeCommand('workbench.action.chat.newChat');

    // Select a command depending on the mode
    const command = mode === "ask"
      ? 'workbench.action.chat.openask'
      : 'workbench.action.chat.openagent';

    // Send the content in the corresponding mode
    await vscode.commands.executeCommand(command, { query: content });
  }
}

export const provider = new CopilotProvider();
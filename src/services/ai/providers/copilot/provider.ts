import * as vscode from "vscode";
import { BaseExtensionProvider } from "../../base";
import type { ProviderModeInfo } from "../../types";

export class CopilotProvider extends BaseExtensionProvider {
  readonly id = "com.github.copilot.vscode";
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

  protected async sendToExtension(content: string, runs: string): Promise<void> {
    // Ensure that implicit context is disabled
    await this.ensureImplicitContextDisabled();

    // Create a new chat
    await vscode.commands.executeCommand('workbench.action.chat.newChat');

    // Use runs as VS Code command ID (or default to agent mode)
    const command = runs || 'workbench.action.chat.openagent';

    // Send the content using the specified command
    await vscode.commands.executeCommand(command, { query: content });
  }

  getSupportedModes(): ProviderModeInfo[] {
    return [
      { modeId: "ask", runs: "workbench.action.chat.openask" },
      { modeId: "agent", runs: "workbench.action.chat.openagent" },
      { modeId: "plan", runs: "workbench.action.chat.openplan" }
    ];
  }
}

export const provider = new CopilotProvider();

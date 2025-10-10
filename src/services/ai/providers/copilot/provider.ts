import * as vscode from "vscode";
import { BaseExtensionProvider } from "../../base";

export class CopilotProvider extends BaseExtensionProvider {
  readonly id = "github.copilot";
  readonly name = "GitHub Copilot Chat";
  protected extensionId = "GitHub.copilot-chat";

  protected async sendToExtension(content: string): Promise<void> {
    // Создаем новый чат
    await vscode.commands.executeCommand('workbench.action.chat.newChat', { query: content });
  }
}

export const provider = new CopilotProvider();
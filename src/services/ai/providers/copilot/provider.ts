import * as vscode from "vscode";
import { BaseExtensionProvider } from "../../BaseAiProvider";

export class CopilotProvider extends BaseExtensionProvider {
  readonly id = "github.copilot";
  readonly name = "GitHub Copilot Chat";
  protected extensionId = "GitHub.copilot-chat";
  protected commandName = "workbench.panel.chat.view.copilot.focus";

  protected async sendToExtension(content: string): Promise<void> {
    // Стратегия 1: Открыть панель Copilot Chat
    try {
      await vscode.commands.executeCommand(this.commandName);
    } catch (e) {
      // Fallback команды
      await vscode.commands.executeCommand("workbench.action.chat.open");
    }

    // Стратегия 2: Копируем в буфер + уведомление
    await vscode.env.clipboard.writeText(content);

    const choice = await vscode.window.showInformationMessage(
      "Content copied to clipboard. Paste it into Copilot Chat.",
      "Open Chat"
    );

    if (choice === "Open Chat") {
      try {
        await vscode.commands.executeCommand(this.commandName);
      } catch {
        await vscode.commands.executeCommand("workbench.action.chat.open");
      }
    }
  }
}

export const provider = new CopilotProvider();
import * as vscode from "vscode";
import { BaseForkProvider } from "../../base";

export class CursorProvider extends BaseForkProvider {
  readonly id = "cursor.composer";
  readonly name = "Cursor Composer";
  protected commandPrefix = "cursor.";

  protected async sendToFork(content: string): Promise<void> {
    // Попытка 1: Команда для отправки в Composer
    const possibleCommands = [
      "cursor.composer.sendToChat",
      "cursor.composer.open",
      "cursor.chat.open"
    ];

    for (const cmd of possibleCommands) {
      try {
        await vscode.commands.executeCommand(cmd, { text: content });
        return; // успех
      } catch (e) {
        // пробуем следующую команду
        continue;
      }
    }

    // Fallback: копируем в буфер + открываем composer
    await vscode.env.clipboard.writeText(content);

    try {
      await vscode.commands.executeCommand("cursor.composer.open");
    } catch {
      // Если и это не работает - просто уведомляем
    }

    vscode.window.showInformationMessage(
      "Content copied to clipboard. Paste it into Cursor Composer (Ctrl+I)."
    );
  }
}

export const provider = new CursorProvider();
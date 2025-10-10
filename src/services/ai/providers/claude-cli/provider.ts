import * as vscode from "vscode";
import { BaseCliProvider } from "../../BaseAiProvider";

export class ClaudeCliProvider extends BaseCliProvider {
  readonly id = "claude.cli";
  readonly name = "Claude CLI";
  protected cliCommand = "claude";

  protected async executeInTerminal(
    terminal: vscode.Terminal,
    filepath: string
  ): Promise<void> {
    // Экранируем путь для shell
    const safePath = process.platform === "win32"
      ? `"${filepath}"`
      : filepath.replace(/ /g, "\\ ");

    // Отправляем команду в терминал
    terminal.sendText(`${this.cliCommand} chat --file ${safePath}`);

    vscode.window.showInformationMessage(
      `Content sent to ${this.name}. Check the terminal.`
    );
  }
}

export const provider = new ClaudeCliProvider();
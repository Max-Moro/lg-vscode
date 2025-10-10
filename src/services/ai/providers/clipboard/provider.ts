import * as vscode from "vscode";
import { BaseAiProvider } from "../../base";

export class ClipboardProvider extends BaseAiProvider {
  readonly id = "clipboard";
  readonly name = "Clipboard";

  async send(content: string): Promise<void> {
    await vscode.env.clipboard.writeText(content);
    vscode.window.showInformationMessage("Content copied to clipboard");
  }
}

export const provider = new ClipboardProvider();
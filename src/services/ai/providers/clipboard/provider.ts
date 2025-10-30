import * as vscode from "vscode";
import { BaseAiProvider } from "../../base";
import type { AiInteractionMode } from "../../../../models/AiInteractionMode";

export class ClipboardProvider extends BaseAiProvider {
  readonly id = "clipboard";
  readonly name = "Clipboard";

  async send(content: string, mode: AiInteractionMode): Promise<void> {
    await vscode.env.clipboard.writeText(content);
    vscode.window.showInformationMessage("Content copied to clipboard");
  }
}

export const provider = new ClipboardProvider();
import * as vscode from "vscode";
import { BaseForkProvider } from "../../base";
import type { AiInteractionMode } from "../../../../models/AiInteractionMode";

/**
 * Cursor IDE AI Integration Provider
 */
export class CursorProvider extends BaseForkProvider {
  readonly id = "cursor.composer";
  readonly name = "Cursor Composer";

  async send(content: string, mode: AiInteractionMode): Promise<void> {
    // Currently, there is no known way to programmatically insert content into Cursor Composer dialog,
    // so we simply copy the content to the clipboard for manual insertion.
    await vscode.env.clipboard.writeText(content);
    vscode.window.showInformationMessage("Content copied to clipboard");

    // Open Cursor Composer
    await vscode.commands.executeCommand('composer.startComposerPrompt');
  }
}

export const provider = new CursorProvider();
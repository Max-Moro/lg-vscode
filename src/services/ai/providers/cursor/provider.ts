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
    // На данный момент в Cursor Composer не известна возможность программной вставки контента в диалог,
    // поэтому просто копируем контент в clipboard для ручной вставки.
    await vscode.env.clipboard.writeText(content);
    vscode.window.showInformationMessage("Content copied to clipboard");
    
    // Открываем Cursor Composer
    await vscode.commands.executeCommand('composer.startComposerPrompt');
  }
}

export const provider = new CursorProvider();
import * as vscode from "vscode";
import { BaseAiProvider } from "../../base";
import type { ProviderModeInfo } from "../../types";

export class ClipboardProvider extends BaseAiProvider {
  readonly id = "clipboard";
  readonly name = "Clipboard";

  async send(content: string, _runs: string): Promise<void> {
    await vscode.env.clipboard.writeText(content);
    vscode.window.showInformationMessage("Content copied to clipboard");
  }

  getSupportedModes(): ProviderModeInfo[] {
    // Clipboard is universal - compatible with all modes, doesn't generate runs
    return [];
  }
}

export const provider = new ClipboardProvider();

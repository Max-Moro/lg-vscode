import * as vscode from "vscode";
import type { ProviderDetector } from "../../types";

export const detector: ProviderDetector = {
  priority: 80,

  async detect(): Promise<boolean> {
    const ext = vscode.extensions.getExtension("GitHub.copilot-chat");
    return ext !== undefined;
  }
};
import * as vscode from "vscode";
import type { ProviderDetector } from "../../types";

export const detector: ProviderDetector = {
  priority: 90,

  async detect(): Promise<boolean> {
    const commands = await vscode.commands.getCommands();
    return commands.some(cmd => cmd.startsWith("cursor."));
  }
};
import * as vscode from "vscode";
import type { ProviderDetector } from "../../types";

export const detector: ProviderDetector = {
  priority: 35,

  async detect(): Promise<boolean> {
    // Check for token in secrets
    // We cannot get context here, so we simply return false
    // User must explicitly select this provider and configure the token
    return false;
  }
};
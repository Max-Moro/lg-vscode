import type { ProviderDetector } from "../../types";

export const detector: ProviderDetector = {
  priority: 10,

  async detect(): Promise<boolean> {
    // Clipboard всегда доступен
    return true;
  }
};
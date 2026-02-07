import * as cp from "child_process";
import type { ProviderDetector } from "../../types";

export const detector: ProviderDetector = {
  priority: 50,

  async detect(): Promise<boolean> {
    try {
      const cmd = process.platform === "win32" ? "where" : "which";
      const result = cp.spawnSync(cmd, ["claude"], { stdio: "ignore", timeout: 4000 });
      return result.status === 0;
    } catch {
      return false;
    }
  }
};
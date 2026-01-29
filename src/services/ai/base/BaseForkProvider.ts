import { BaseAiProvider } from "./BaseAiProvider";
import type { ProviderModeInfo } from "../types";

/**
 * Base class for Fork-based providers (Cursor, Windsurf, etc.)
 *
 * Currently used for logical separation and does not have
 * any special shared functionality.
 */
export abstract class BaseForkProvider extends BaseAiProvider {
  abstract getSupportedModes(): ProviderModeInfo[];
}

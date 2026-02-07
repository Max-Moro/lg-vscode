import type { AiProvider, ProviderModeInfo } from "../types";

/**
 * Base abstract class for all AI providers
 *
 * Defines the minimum interface that any provider must implement.
 * All specialized base classes inherit from this class.
 */
export abstract class BaseAiProvider implements AiProvider {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract send(content: string, runs: string): Promise<void>;
  abstract getSupportedModes(): ProviderModeInfo[];
}

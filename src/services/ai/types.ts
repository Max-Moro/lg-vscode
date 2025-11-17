/**
 * Base types for the AI Integration system
 */

/**
 * Information about the provider detector
 */
export interface ProviderDetector {
  /** Priority of the provider (0-100, higher = preferred) */
  priority: number;

  /**
   * Check provider availability
   * Called once when the extension is activated
   */
  detect(): Promise<boolean>;
}

import type { AiInteractionMode } from "../../models/AiInteractionMode";

/**
 * AI provider interface
 */
export interface AiProvider {
  /** Unique provider identifier */
  readonly id: string;

  /** Human-readable provider name */
  readonly name: string;

  /**
   * Send content to AI
   * @param content - Content to send
   * @param mode - AI interaction mode (ask/agent)
   * @throws Error on sending error
   */
  send(content: string, mode: AiInteractionMode): Promise<void>;
}

/**
 * Complete provider information with detector
 */
export interface ProviderModule {
  provider: AiProvider;
  detector: ProviderDetector;
}
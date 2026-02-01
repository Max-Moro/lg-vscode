/**
 * Base types for the AI Integration system
 */

/**
 * Information about provider-supported mode.
 * Used for generating ai-interaction.sec.yaml
 */
export interface ProviderModeInfo {
  /** Mode identifier (ask, agent, plan) */
  modeId: string;
  /** Value for runs field in YAML */
  runs: string;
}

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
   * @param runs - Provider-specific run configuration string (opaque, interpreted by provider)
   * @throws Error on sending error
   */
  send(content: string, runs: string): Promise<void>;

  /**
   * Returns list of modes supported by this provider.
   * Used for generating ai-interaction.sec.yaml
   *
   * @returns Array of supported modes with their runs values
   */
  getSupportedModes(): ProviderModeInfo[];
}

/**
 * Complete provider information with detector
 */
export interface ProviderModule {
  provider: AiProvider;
  detector: ProviderDetector;
}

/**
 * Provider settings module interface.
 * Allows providers to define their own commands, rules, and ViewModel contributions.
 */
export interface ProviderSettingsModule {
  /** Provider ID this module belongs to */
  providerId: string;

  /** Business rules for provider-specific commands */
  rules: import("../../state/types").BusinessRule[];

  /** Default values for provider-specific persistent state */
  stateDefaults: Record<string, unknown>;

  /** Build provider-specific ViewModel properties */
  buildViewModel: (state: import("../../state/types").PCEState) => Record<string, unknown>;

  /** Check if this provider's settings should be visible */
  isVisible: (state: import("../../state/types").PCEState) => boolean;
}

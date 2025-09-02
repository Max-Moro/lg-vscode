/**
 * AI Integration Module Exports
 */

export { AiIntegrationService } from './AiIntegrationService';
export { AiProviderDetector } from './detector';
export { BaseAiProvider } from './BaseAiProvider';
export { CursorAiProvider } from './providers/CursorAiProvider';
export { CopilotProvider } from './providers/CopilotProvider';
export { CopilotExtensionService } from './CopilotExtensionService';

export type {
  AiProvider,
  ContentType,
  AiContent,
  AiProviderOptions,
  AiProviderCapabilities,
  AiProviderInfo,
  IAiProvider,
  ProviderDetectionResult
} from './types';

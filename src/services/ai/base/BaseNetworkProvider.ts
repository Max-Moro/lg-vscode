import * as vscode from "vscode";
import { BaseAiProvider } from "./BaseAiProvider";
import type { AiInteractionMode } from "../../../models/AiInteractionMode";

/**
 * Base class for Network-based providers
 *
 * Used for providers that work through HTTP APIs
 * (e.g., OpenAI API, Anthropic API).
 *
 * Main capabilities:
 * - Secure token storage via VS Code Secrets API
 * - HTTP requests with timeout and abort handling
 * - Extension context management for accessing secrets
 * - Centralized network error handling
 */
export abstract class BaseNetworkProvider extends BaseAiProvider {
  /** API endpoint URL (e.g., "https://api.openai.com/v1/chat/completions") */
  protected abstract apiEndpoint: string;
  
  /** Key for storing token in VS Code secrets (e.g., "lg.openai.apiKey") */
  protected abstract secretKey: string;
  
  /** Extension context for accessing VS Code Secrets API */
  protected context?: vscode.ExtensionContext;

  /**
   * Set context for accessing secrets
   *
   * Must be called before first use of the provider,
   * otherwise getApiToken will throw an error.
   *
   * @param context - Extension context from activate()
   */
  setContext(context: vscode.ExtensionContext): void {
    this.context = context;
  }

  /**
   * Get API token from VS Code secrets
   *
   * @returns API token
   * @throws Error if context is not set or token is not found
   */
  protected async getApiToken(): Promise<string> {
    if (!this.context) {
      throw new Error("Extension context not set for network provider");
    }
    const token = await this.context.secrets.get(this.secretKey);
    if (!token) {
      throw new Error(
        `API token not found. Please set it in VS Code settings: ${this.secretKey}`
      );
    }
    return token;
  }

  /**
   * Send HTTP request with timeout
   *
   * Uses AbortController to interrupt the request on timeout.
   * Automatically clears the timeout after the request completes.
   *
   * @param url - URL for the request
   * @param options - Fetch options (method, headers, body)
   * @param timeoutMs - Timeout in milliseconds (default 30 seconds)
   * @returns Response object
   * @throws AbortError on timeout
   */
  protected async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number = 30000
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Send content via API
   *
   * Gets token from secrets and calls sendToApi to execute the request.
   */
  async send(content: string, mode: AiInteractionMode): Promise<void> {
    const token = await this.getApiToken();

    // Do not pass AI interaction mode, as Network-based providers
    // by their nature only have ASK behavior semantics.
    await this.sendToApi(content, token);
  }

  /**
   * Method to send content to a specific API.
   *
   * Implemented by subclasses for provider-specific API interaction logic.
   * Should handle request formation, sending, and response parsing.
   *
   * @param content - Content to send
   * @param token - API token from secrets
   */
  protected abstract sendToApi(content: string, token: string): Promise<void>;
}

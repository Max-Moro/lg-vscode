import * as vscode from "vscode";
import { BaseAiProvider } from "./BaseAiProvider";

/**
 * Базовый класс для Network-based провайдеров
 * 
 * Используется для провайдеров, которые работают через HTTP API
 * (например, OpenAI API, Anthropic API).
 * 
 * Основные возможности:
 * - Безопасное хранение токенов через VS Code Secrets API
 * - HTTP запросы с таймаутом и обработкой abort
 * - Управление контекстом расширения для доступа к секретам
 * - Централизованная обработка ошибок сети
 */
export abstract class BaseNetworkProvider extends BaseAiProvider {
  /** URL endpoint API (например, "https://api.openai.com/v1/chat/completions") */
  protected abstract apiEndpoint: string;
  
  /** Ключ для хранения токена в VS Code secrets (например, "lg.openai.apiKey") */
  protected abstract secretKey: string;
  
  /** Контекст расширения для доступа к VS Code Secrets API */
  protected context?: vscode.ExtensionContext;

  /**
   * Установить context для доступа к secrets
   * 
   * Должен быть вызван до первого использования провайдера,
   * иначе getApiToken выбросит ошибку.
   * 
   * @param context - Контекст расширения из activate()
   */
  setContext(context: vscode.ExtensionContext): void {
    this.context = context;
  }

  /**
   * Получить API токен из секретов VS Code
   * 
   * @returns API токен
   * @throws Error если контекст не установлен или токен не найден
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
   * Отправить HTTP запрос с таймаутом
   * 
   * Использует AbortController для прерывания запроса по таймауту.
   * Автоматически очищает таймер после завершения запроса.
   * 
   * @param url - URL для запроса
   * @param options - Опции fetch (метод, заголовки, тело)
   * @param timeoutMs - Таймаут в миллисекундах (по умолчанию 30 секунд)
   * @returns Response объект
   * @throws AbortError при таймауте
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
   * Отправка контента через API
   * 
   * Получает токен из секретов и вызывает sendToApi для выполнения запроса.
   */
  async send(content: string): Promise<void> {
    const token = await this.getApiToken();
    await this.sendToApi(content, token);
  }

  /**
   * Метод для отправки контента в конкретный API
   * 
   * Реализуется наследниками для специфичной логики взаимодействия с API.
   * Должен обрабатывать формирование запроса, отправку и разбор ответа.
   * 
   * @param content - Контент для отправки
   * @param token - API токен из секретов
   */
  protected abstract sendToApi(content: string, token: string): Promise<void>;
}

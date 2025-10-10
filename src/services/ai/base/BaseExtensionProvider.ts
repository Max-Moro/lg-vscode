import * as vscode from "vscode";
import { BaseAiProvider } from "./BaseAiProvider";

/**
 * Базовый класс для Extension-based провайдеров
 * 
 * Используется для провайдеров, которые работают через другие расширения VS Code
 * (например, GitHub Copilot).
 * 
 * Основные возможности:
 * - Автоматическая активация расширения при необходимости
 * - Проверка наличия расширения
 * - Обработка ошибок отсутствия расширения
 */
export abstract class BaseExtensionProvider extends BaseAiProvider {
  protected abstract extensionId: string;

  /**
   * Проверка активности расширения и его активация при необходимости
   * @throws Error если расширение не найдено
   */
  protected async ensureExtensionActive(): Promise<void> {
    const ext = vscode.extensions.getExtension(this.extensionId);
    if (!ext) {
      throw new Error(`Extension ${this.extensionId} not found`);
    }
    if (!ext.isActive) {
      await ext.activate();
    }
  }

  /**
   * Отправка контента через расширение
   * Сначала проверяет и активирует расширение, затем вызывает sendToExtension
   */
  async send(content: string): Promise<void> {
    await this.ensureExtensionActive();
    await this.sendToExtension(content);
  }

  /**
   * Метод для отправки контента в конкретное расширение
   * Реализуется наследниками для специфичной логики взаимодействия
   * 
   * @param content - Контент для отправки
   */
  protected abstract sendToExtension(content: string): Promise<void>;
}

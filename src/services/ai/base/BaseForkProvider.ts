import * as vscode from "vscode";
import { BaseAiProvider } from "./BaseAiProvider";

/**
 * Базовый класс для Fork-based провайдеров (Cursor, Windsurf и т.д.)
 * 
 * Используется для провайдеров, которые работают в форках VS Code с собственными командами.
 * Основное отличие от расширений — команды встроены в сам форк редактора.
 * 
 * Основные возможности:
 * - Детекция специфичных команд форка
 * - Проверка работы в нужном редакторе
 * - Обработка ошибок несовместимости окружения
 */
export abstract class BaseForkProvider extends BaseAiProvider {
  /** Префикс команд, специфичных для данного форка (например, "cursor." для Cursor IDE) */
  protected abstract commandPrefix: string;

  /**
   * Проверка доступности команд форка
   * 
   * Определяет, работает ли расширение в нужном форке VS Code,
   * проверяя наличие специфичных команд с заданным префиксом.
   * 
   * @returns true если команды форка доступны
   */
  protected async hasForkCommands(): Promise<boolean> {
    const commands = await vscode.commands.getCommands();
    return commands.some(cmd => cmd.startsWith(this.commandPrefix));
  }

  /**
   * Отправка контента через форк
   * Сначала проверяет доступность команд форка, затем вызывает sendToFork
   * 
   * @throws Error если команды форка недоступны (неправильное окружение)
   */
  async send(content: string): Promise<void> {
    if (!(await this.hasForkCommands())) {
      throw new Error(`${this.name} commands not found. Are you running in ${this.name}?`);
    }
    await this.sendToFork(content);
  }

  /**
   * Метод для отправки контента в конкретный форк
   * Реализуется наследниками для специфичной логики взаимодействия с форком
   * 
   * @param content - Контент для отправки
   */
  protected abstract sendToFork(content: string): Promise<void>;
}

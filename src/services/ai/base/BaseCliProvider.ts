import * as vscode from "vscode";
import { BaseAiProvider } from "./BaseAiProvider";

/**
 * Базовый класс для CLI-based провайдеров
 * 
 * Используется для провайдеров, которые работают через CLI утилиты в терминале
 * (например, Claude CLI).
 * 
 * Основные возможности:
 * - Управление терминалом (создание, переиспользование)
 * - Работа с временными файлами
 * - Автоматическое экранирование путей
 * - Инициализация shell с задержкой
 */
export abstract class BaseCliProvider extends BaseAiProvider {
  /** Команда CLI для запуска (например, "claude", "aichat") */
  protected abstract cliCommand: string;

  /**
   * Создать и подготовить терминал
   * 
   * Переиспользует существующий терминал с тем же именем или создает новый.
   * Показывает терминал пользователю и дает время на инициализацию shell.
   * 
   * @returns Готовый к работе терминал
   */
  protected async ensureTerminal(): Promise<vscode.Terminal> {
    // Проверяем существующий терминал
    const existing = vscode.window.terminals.find(t => t.name === this.name);
    if (existing) {
      return existing;
    }

    // Создаем новый терминал
    const terminal = vscode.window.createTerminal({
      name: this.name,
      hideFromUser: false
    });

    // Показываем терминал
    terminal.show(true);

    // Даем время на инициализацию shell (простая задержка)
    await new Promise(resolve => setTimeout(resolve, 500));

    return terminal;
  }

  /**
   * Создать временный файл с контентом
   * 
   * Создает файл в системной временной директории с уникальным именем
   * на основе timestamp. Файлы очищаются системой автоматически.
   * 
   * @param content - Контент для записи в файл
   * @returns Абсолютный путь к созданному файлу
   */
  protected async createTempFile(content: string): Promise<string> {
    const os = await import("os");
    const path = await import("path");
    const fs = await import("fs/promises");

    const tmpDir = os.tmpdir();
    const timestamp = Date.now();
    const filename = `lg-ai-${timestamp}.md`;
    const filepath = path.join(tmpDir, filename);

    await fs.writeFile(filepath, content, "utf-8");

    return filepath;
  }

  /**
   * Отправка контента через CLI
   * 
   * Создает временный файл с контентом, готовит терминал
   * и вызывает executeInTerminal для выполнения команды.
   */
  async send(content: string): Promise<void> {
    const terminal = await this.ensureTerminal();
    const filepath = await this.createTempFile(content);

    await this.executeInTerminal(terminal, filepath);
  }

  /**
   * Метод для выполнения CLI команды в терминале
   * 
   * Реализуется наследниками для формирования специфичной команды.
   * Должен обрабатывать экранирование путей для текущей ОС.
   * 
   * @param terminal - Подготовленный терминал
   * @param filepath - Абсолютный путь к временному файлу с контентом
   */
  protected abstract executeInTerminal(terminal: vscode.Terminal, filepath: string): Promise<void>;
}

import * as vscode from "vscode";
import type { AiProvider } from "./types";

/**
 * Базовый абстрактный класс для всех AI провайдеров
 */
export abstract class BaseAiProvider implements AiProvider {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract send(content: string): Promise<void>;
}

/**
 * Базовый класс для Extension-based провайдеров
 */
export abstract class BaseExtensionProvider extends BaseAiProvider {
  protected abstract extensionId: string;
  protected abstract commandName: string;

  /**
   * Проверка активности расширения
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

  async send(content: string): Promise<void> {
    await this.ensureExtensionActive();
    await this.sendToExtension(content);
  }

  protected abstract sendToExtension(content: string): Promise<void>;
}

/**
 * Базовый класс для Fork-based провайдеров (Cursor, Windsurf)
 */
export abstract class BaseForkProvider extends BaseAiProvider {
  protected abstract commandPrefix: string;

  /**
   * Проверка доступности команд форка
   */
  protected async hasForkCommands(): Promise<boolean> {
    const commands = await vscode.commands.getCommands();
    return commands.some(cmd => cmd.startsWith(this.commandPrefix));
  }

  async send(content: string): Promise<void> {
    if (!(await this.hasForkCommands())) {
      throw new Error(`${this.name} commands not found. Are you running in ${this.name}?`);
    }
    await this.sendToFork(content);
  }

  protected abstract sendToFork(content: string): Promise<void>;
}

/**
 * Базовый класс для CLI-based провайдеров
 */
export abstract class BaseCliProvider extends BaseAiProvider {
  protected abstract cliCommand: string;

  /**
   * Создать и подготовить терминал
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

  async send(content: string): Promise<void> {
    const terminal = await this.ensureTerminal();
    const filepath = await this.createTempFile(content);

    await this.executeInTerminal(terminal, filepath);
  }

  protected abstract executeInTerminal(terminal: vscode.Terminal, filepath: string): Promise<void>;
}

/**
 * Базовый класс для Network-based провайдеров
 */
export abstract class BaseNetworkProvider extends BaseAiProvider {
  protected abstract apiEndpoint: string;
  protected abstract secretKey: string; // ключ в VS Code secrets
  protected context?: vscode.ExtensionContext;

  /**
   * Установить context для доступа к secrets
   */
  setContext(context: vscode.ExtensionContext): void {
    this.context = context;
  }

  /**
   * Получить API токен из секретов
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

  async send(content: string): Promise<void> {
    const token = await this.getApiToken();
    await this.sendToApi(content, token);
  }

  protected abstract sendToApi(content: string, token: string): Promise<void>;
}
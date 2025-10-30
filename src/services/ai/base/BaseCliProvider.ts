import * as vscode from "vscode";
import { BaseAiProvider } from "./BaseAiProvider";
import type { AiInteractionMode } from "../../../models/AiInteractionMode";
import type { ShellType } from "../../../models/ShellType";

/**
 * CLI execution context with scope and shell configuration
 */
export interface CliExecutionContext {
  /** Workspace scope (subdirectory) for CLI execution */
  scope: string;
  /** Terminal shell type */
  shell: ShellType;
  /** AI interaction mode */
  mode: AiInteractionMode;
  /** Claude model (haiku, sonnet, opus) - optional, only for Claude CLI provider */
  claudeModel?: string;
}

/**
 * Базовый класс для CLI-based провайдеров
 * 
 * Используется для провайдеров, которые работают через CLI утилиты в терминале
 * (например, Claude CLI).
 * 
 * Основные возможности:
 * - Управление терминалом (создание, переиспользование)
 * - Инициализация shell с задержкой
 * - Поддержка scope (workspace subdirectory) и shell type
 * - Детекция незавершенных процессов в терминале
 */
export abstract class BaseCliProvider extends BaseAiProvider {
  /** Extension context для доступа к ControlStateService */
  protected context?: vscode.ExtensionContext;

  /**
   * Установить extension context
   * Должен быть вызван перед использованием провайдера
   */
  setContext(context: vscode.ExtensionContext): void {
    this.context = context;
  }
  
  /**
   * Получить базовый CLI execution context из ControlStateService
   * @param mode - AI interaction mode
   * @returns Базовый CLI execution context с настройками scope, shell и claudeModel
   */
  protected async getCliBaseContext(mode: AiInteractionMode): Promise<CliExecutionContext> {
    if (!this.context) {
      throw new Error("Extension context not set for CLI provider");
    }
    
    // Импортируем ControlStateService
    const { ControlStateService } = await import("../../ControlStateService");
    const stateService = ControlStateService.getInstance(this.context);
    const state = stateService.getState();
    
    return {
      scope: state.cliScope || "",
      shell: state.cliShell!,
      mode,
      claudeModel: state.claudeModel
    };
  }

  /**
   * Проверить, занят ли терминал незавершенным процессом.
   *
   * @param terminal - Терминал для проверки
   * @param ctx - Базовый CLI execution context с настройками scope
   * @returns объект с флагом busy и сообщением для пользователя
   */
  protected abstract checkTerminalBusy(
    terminal: vscode.Terminal,
    ctx: CliExecutionContext
  ): Promise<{
    busy: boolean;
    message?: string;
  }>;

  /**
   * Создать и подготовить терминал
   * 
   * Переиспользует существующий терминал с тем же именем если он не занят,
   * или создает новый. Показывает терминал пользователю и дает время на 
   * инициализацию shell. Терминал запускается в директории effectiveWorkspaceRoot.
   * 
   * @param ctx - Базовый CLI execution context для проверки занятости терминала
   * @returns Объект с терминалом и флагом isNew, или undefined если терминал занят
   */
  protected async ensureTerminal(
    ctx: CliExecutionContext
  ): Promise<{ terminal: vscode.Terminal; isNew: boolean } | undefined> {
    // Проверяем существующий терминал
    const existing = vscode.window.terminals.find(t => t.name === this.name);
    
    if (existing) {
      // Проверяем, был ли терминал корректно завершен
      if (existing.exitStatus !== undefined) {
        // Терминал завершен — нельзя переиспользовать, нужно создать новый
        existing.dispose();
      } else {
        // Терминал активен — проверяем, занят ли он процессом
        const { busy, message } = await this.checkTerminalBusy(existing, ctx);
        
        if (busy) {
          // Показываем предупреждение пользователю с возможностью показать терминал
          vscode.window.showWarningMessage(
            message || "Previous CLI session is still running. Please complete it before starting a new one.",
            "Show Terminal"
          ).then(choice => {
            if (choice === "Show Terminal") {
              existing.show(true);
            }
          });
          
          // Возвращаем undefined — терминал занят, операция прервана
          return undefined;
        }
        
        // Терминал свободен — переиспользуем
        return { terminal: existing, isNew: false };
      }
    }

    // Получаем эффективный workspace root из CliResolver
    const { effectiveWorkspaceRoot } = await import("../../../cli/CliResolver");
    const workspaceRoot = effectiveWorkspaceRoot()!;

    // Создаем новый терминал в директории effectiveWorkspaceRoot
    const terminal = vscode.window.createTerminal({
      name: this.name,
      hideFromUser: false,
      cwd: workspaceRoot
    });

    // Показываем терминал
    terminal.show(true);

    // Даем время на инициализацию shell (простая задержка)
    await new Promise(resolve => setTimeout(resolve, 500));

    return { terminal, isNew: true };
  }

  /**
   * Отправка контента через CLI
   * 
   * Получает CLI execution context, готовит терминал,
   * применяет смену директории (если нужно) и
   * вызывает executeInTerminal для выполнения команды.
   */
  async send(content: string, mode: AiInteractionMode): Promise<void> {
    // Получаем базовый CLI execution context
    const baseCtx = await this.getCliBaseContext(mode);
       
    // Создаем терминал и получаем флаг isNew
    const result = await this.ensureTerminal(baseCtx);
    
    // Если терминал занят, тихо прерываем выполнение (пользователь уже предупрежден)
    if (!result) {
      return;
    }
    
    // Смена директории для нового терминала (если scope задан)
    if (result.isNew && baseCtx.scope && baseCtx.scope.trim()) {
      // Валидация scope — проверка что это относительный путь.
      const path = require("path");
      if (path.isAbsolute(baseCtx.scope)) {
          throw new Error("Scope must be a relative path");
      }

      result.terminal.sendText(`cd "${baseCtx.scope}"`, true);
      
      // Небольшая задержка для завершения cd
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Выполняем провайдер-специфичную команду
    await this.executeInTerminal(content, result.terminal, baseCtx);
  }

  /**
   * Метод для выполнения CLI команды в терминале.
   *
   * Реализуется наследниками для формирования специфичной команды.
   * К моменту вызова терминал уже находится в нужной директории (если scope был задан).
   *
   * @param content - Контент для отправки
   * @param terminal - Подготовленный терминал (уже в нужной директории)
   * @param ctx - Базовый CLI execution context с настройками scope, shell и mode
   */
  protected abstract executeInTerminal(
    content: string,
    terminal: vscode.Terminal,
    ctx: CliExecutionContext
  ): Promise<void>;
}
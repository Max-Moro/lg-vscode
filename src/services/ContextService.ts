import * as vscode from "vscode";
import { cliRender, cliReport } from "../cli/CliClient";
import type { RunResult } from "../models/report";
import { ControlStateService } from "./ControlStateService";

/**
 * Сервис для работы с контекстами.
 * Получает все параметры из ControlStateService.
 */
export class ContextService {
  private stateService: ControlStateService;
  
  constructor(context: vscode.ExtensionContext) {
    this.stateService = ControlStateService.getInstance(context);
  }
  
  /**
   * Сгенерировать контекст для текущего шаблона из состояния
   * @throws {Error} если шаблон не выбран
   */
  async generateContext(): Promise<string> {
    const state = this.stateService.getState();
    if (!state.template) {
      throw new Error("No template selected");
    }
    
    const target = `ctx:${state.template}`;
    return cliRender(target, state);
  }
  
  /**
   * Получить статистику для текущего контекста
   * @throws {Error} если шаблон не выбран
   */
  async getStats(): Promise<RunResult> {
    const state = this.stateService.getState();
    if (!state.template) {
      throw new Error("No template selected");
    }
    
    const target = `ctx:${state.template}`;
    return cliReport(target, state);
  }
  
  /**
   * Получить имя текущего шаблона контекста
   * @returns имя шаблона или пустую строку если не выбран
   */
  getCurrentTemplate(): string {
    const state = this.stateService.getState();
    return state.template || "";
  }
}

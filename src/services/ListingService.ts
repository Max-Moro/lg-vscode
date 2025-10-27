import * as vscode from "vscode";
import { cliRender, cliReport } from "../cli/CliClient";
import { ControlStateService } from "./ControlStateService";

/**
 * Сервис для работы с листингами секций.
 * Получает все параметры из ControlStateService.
 */
export class ListingService {
  private stateService: ControlStateService;
  
  constructor(context: vscode.ExtensionContext) {
    this.stateService = ControlStateService.getInstance(context);
  }
  
  /**
   * Сгенерировать листинг для текущей секции из состояния
   * @throws {Error} если секция не выбрана
   */
  async generateListing(): Promise<string> {
    const state = this.stateService.getState();
    if (!state.section) {
      throw new Error("No section selected");
    }
    const target = `sec:${state.section}`;
    return cliRender(target, state);
  }
  
  /**
   * Получить статистику для текущей секции
   * @throws {Error} если секция не выбрана
   */
  async getStats(): Promise<import("../models/report").RunResult> {
    const state = this.stateService.getState();
    if (!state.section) {
      throw new Error("No section selected");
    }
    const target = `sec:${state.section}`;
    return cliReport(target, state);
  }
  
  /**
   * Получить список файлов, включенных в текущую секцию
   * @throws {Error} если секция не выбрана
   */
  async getIncludedFiles(): Promise<{ path: string; sizeBytes: number }[]> {
    const state = this.stateService.getState();
    if (!state.section) {
      throw new Error("No section selected");
    }
    const target = `sec:${state.section}`;
    const data = await cliReport(target, state);
    const files = Array.isArray(data.files) ? data.files : [];
    return files.map((f: any) => ({ path: f.path, sizeBytes: f.sizeBytes ?? 0 }));
  }
  
  /**
   * Получить имя текущей секции
   * @returns имя секции или пустую строку если не выбрана
   */
  getCurrentSection(): string {
    const state = this.stateService.getState();
    return state.section || "";
  }
}

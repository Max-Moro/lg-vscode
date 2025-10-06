import { runCli } from "./CliResolver";
import type { RunResult } from "../models/report";
import type { DiagReport } from "../models/diag_report";

export interface CliOptions {
  model?: string;
  modes?: Record<string, string>; // modeset -> mode
  tags?: string[]; // active tags
  taskText?: string; // text of the current task
}

/**
 * Определяет, нужно ли использовать stdin для передачи task text.
 * Используем stdin если:
 * - Есть переносы строк
 * - Есть кавычки (одинарные или двойные)
 * - Есть управляющие символы
 * - Длина больше 200 символов (для надежности)
 */
function shouldUseStdin(text: string): boolean {
  if (!text) return false;
  
  // Переносы строк
  if (/[\r\n]/.test(text)) return true;
  
  // Кавычки (могут вызвать проблемы с экранированием)
  if (/["']/.test(text)) return true;
  
  // Управляющие символы
  if (/[\x00-\x1F\x7F]/.test(text)) return true;
  
  // Длинный текст (для перестраховки)
  if (text.length > 200) return true;
  
  return false;
}

export async function cliRender(target: string, options: CliOptions = {}): Promise<string> {
  const args: string[] = ["render", target];
  
  if (options.model) {
    args.push("--model", options.model);
  }
  
  if (options.modes) {
    for (const [modeset, mode] of Object.entries(options.modes)) {
      if (mode) {
        args.push("--mode", `${modeset}:${mode}`);
      }
    }
  }
  
  if (options.tags && options.tags.length > 0) {
    args.push("--tags", options.tags.join(","));
  }
  
  // Умная передача task text
  let stdinData: string | undefined;
  if (options.taskText && options.taskText.trim()) {
    const taskText = options.taskText.trim();
    if (shouldUseStdin(taskText)) {
      // Используем stdin для безопасной передачи
      args.push("--task", "-");
      stdinData = taskText;
    } else {
      // Простой текст — передаем как аргумент
      args.push("--task", taskText);
    }
  }
  
  return runCli(args, { timeoutMs: 120_000, stdinData });
}

export async function cliReport(target: string, options: CliOptions = {}): Promise<RunResult> {
  const args: string[] = ["report", target];
  
  if (options.model) {
    args.push("--model", options.model);
  }
  
  if (options.modes) {
    for (const [modeset, mode] of Object.entries(options.modes)) {
      if (mode) {
        args.push("--mode", `${modeset}:${mode}`);
      }
    }
  }
  
  if (options.tags && options.tags.length > 0) {
    args.push("--tags", options.tags.join(","));
  }
  
  // Умная передача task text
  let stdinData: string | undefined;
  if (options.taskText && options.taskText.trim()) {
    const taskText = options.taskText.trim();
    if (shouldUseStdin(taskText)) {
      // Используем stdin для безопасной передачи
      args.push("--task", "-");
      stdinData = taskText;
    } else {
      // Простой текст — передаем как аргумент
      args.push("--task", taskText);
    }
  }
  
  const out = await runCli(args, { timeoutMs: 120_000, stdinData });
  const data = JSON.parse(out);
  return data as RunResult;
}

export async function cliList(what: "sections" | "contexts" | "models" | "mode-sets" | "tag-sets") {
  const out = await runCli(["list", what], { timeoutMs: 20_000 });
  const data = JSON.parse(out);
  
  // For the new commands, return the full object structure
  if (what === "mode-sets" || what === "tag-sets") {
    return data;
  }
  
  // For legacy commands, extract the array
  return data?.[what] ?? data ?? [];
}

export async function cliDiag(rebuild?: boolean): Promise<DiagReport> {
  const args = ["diag"].concat(rebuild ? ["--rebuild-cache"] : []);
  const out = await runCli(args, { timeoutMs: rebuild ? 60_000 : 20_000 });
  const data = JSON.parse(out);
  return data as DiagReport;
}

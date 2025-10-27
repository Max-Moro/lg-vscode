import { runCli } from "./CliResolver";
import type { RunResult } from "../models/report";
import type { DiagReport } from "../models/diag_report";
import type { ControlPanelState } from "../services/ControlStateService";

/**
 * Внутренняя функция для сборки аргументов CLI команд render/report.
 *
 * @param command - команда CLI ("render" или "report")
 * @param target - цель (например, "ctx:name" или "sec:name")
 * @param state - состояние панели управления
 * @returns объект с args и stdinData для передачи в runCli
 */
function buildCliArgs(command: string, target: string, state: Partial<ControlPanelState>): { args: string[]; stdinData?: string } {
  const args: string[] = [command, target];
  
  // Обязательные параметры токенизации
  args.push("--lib", state.tokenizerLib!);
  args.push("--encoder", state.encoder!);
  args.push("--ctx-limit", String(state.ctxLimit!));
  
  // Режимы (modes)
  if (state.modes) {
    for (const [modeset, mode] of Object.entries(state.modes)) {
      if (mode) {
        args.push("--mode", `${modeset}:${mode}`);
      }
    }
  }
  
  // Теги (преобразуем из Record<tagSetId, tagId[]> в плоский список)
  if (state.tags) {
    const flatTags: string[] = [];
    for (const tagIds of Object.values(state.tags)) {
      flatTags.push(...tagIds);
    }
    if (flatTags.length > 0) {
      args.push("--tags", flatTags.join(","));
    }
  }
  
  // Целевая ветка (для режима review)
  if (state.targetBranch && state.targetBranch.trim()) {
    args.push("--target-branch", state.targetBranch.trim());
  }
  
  // Текст задачи (передаём через stdin)
  let stdinData: string | undefined;
  if (state.taskText && state.taskText.trim()) {
    args.push("--task", "-");
    stdinData = state.taskText.trim();
  }
  
  return { args, stdinData };
}

export async function cliRender(target: string, state: Partial<ControlPanelState>): Promise<string> {
  const { args, stdinData } = buildCliArgs("render", target, state);
  return runCli(args, { timeoutMs: 120_000, stdinData });
}

export async function cliReport(target: string, state: Partial<ControlPanelState>): Promise<RunResult> {
  const { args, stdinData } = buildCliArgs("report", target, state);
  const out = await runCli(args, { timeoutMs: 120_000, stdinData });
  const data = JSON.parse(out);
  return data as RunResult;
}

export async function cliList(what: "sections" | "contexts" | "mode-sets" | "tag-sets") {
  const out = await runCli(["list", what], { timeoutMs: 20_000 });
  const data = JSON.parse(out);
  
  if (what === "mode-sets" || what === "tag-sets") {
    return data;
  }
  
  return data?.[what] ?? data ?? [];
}

export async function cliDiag(rebuild?: boolean): Promise<DiagReport> {
  const args = ["diag"].concat(rebuild ? ["--rebuild-cache"] : []);
  const out = await runCli(args, { timeoutMs: rebuild ? 60_000 : 20_000 });
  const data = JSON.parse(out);
  return data as DiagReport;
}

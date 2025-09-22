import { runCli } from "./CliResolver";
import type { RunResult } from "../models/report";
import type { DiagReport } from "../models/diag_report";

export async function cliRender(target: string): Promise<string> {
  const args: string[] = ["render", target];
  return runCli(args, { timeoutMs: 120_000 });
}

export async function cliReport(target: string, model?: string): Promise<RunResult> {
  const args: string[] = ["report", target, "--model", model ?? "o3"];
  const out = await runCli(args, { timeoutMs: 120_000 });
  const data = JSON.parse(out);
  return data as RunResult;
}

export async function cliList(what: "sections" | "contexts" | "models") {
  const out = await runCli(["list", what], { timeoutMs: 20_000 });
  const data = JSON.parse(out);
  return data?.[what] ?? [];
}

export async function cliDiag(rebuild?: boolean): Promise<DiagReport> {
  const args = ["diag"].concat(rebuild ? ["--rebuild-cache"] : []);
  const out = await runCli(args, { timeoutMs: rebuild ? 60_000 : 20_000 });
  const data = JSON.parse(out);
  return data as DiagReport;
}

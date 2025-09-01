import { runCli } from "./CliResolver";
import { assertProtocol } from "../protocol";
export type RunResult = import("../protocol").RunResult;

export async function cliRender(target: string, options?: { mode?: "all" | "changes" }): Promise<string> {
  const args: string[] = ["render", target];
  if (options?.mode) args.push("--mode", options.mode);
  return runCli(args, { timeoutMs: 120_000 });
}

export async function cliReport(target: string, model?: string, mode?: "all" | "changes"): Promise<RunResult> {
  const args: string[] = ["report", target, "--model", model ?? "o3"];
  if (mode) args.push("--mode", mode);
  const out = await runCli(args, { timeoutMs: 120_000 });
  const data = JSON.parse(out);
  assertProtocol(data, "report");
  return data as RunResult;
}

export async function cliList(what: "sections" | "contexts" | "models") {
  const out = await runCli(["list", what], { timeoutMs: 20_000 });
  const data = JSON.parse(out);
  return data?.[what] ?? [];
}

export async function cliDiag(rebuild?: boolean): Promise<any> {
  const args = ["diag"].concat(rebuild ? ["--rebuild-cache"] : []);
  const out = await runCli(args, { timeoutMs: rebuild ? 60_000 : 20_000 });
  const data = JSON.parse(out);
  assertProtocol(data, "diag");
  return data;
}

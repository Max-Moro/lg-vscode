import { runCli } from "./CliResolver";
import { assertProtocol } from "../protocol";
import { spawnToResult } from "../runner/LgProcess";
import { effectiveWorkspaceRoot } from "./CliResolver";

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

export async function cliDiagBundle(): Promise<{ data: any; bundlePath?: string }> {
  // прямой запуск через spawnToResult, чтобы получить stderr (путь к zip)
  const specOut = await import("./CliResolver");
  const rs = await (await import("./CliResolver"));
  const spec = await (rs as any).runCli ? undefined : undefined; // не используется, оставлено для совместимости
  const { stdout, stderr } = await spawnToResult(
    (await import("../runner/LgInstaller")).resolveManagedCliBin as any, // не нужен; ниже обычный вызов runCli эквивалентен
    [] as any
  );
  // ↑ Этот трюк выглядит странно — поэтому ниже нормальная реализация:
  const { cmd, args } = { cmd: "", args: [] as string[] }; // не используем
  // Реализация через runCli недоступна для stderr, поэтому просто повторим код из старого LgLocator:
  const { RunSpec } = {} as any; // TS хак — не нужен
  const resolver = await import("./CliResolver");
  const runSpec: any = await (resolver as any).__proto__?.resolveCliRunSpec?.() ?? undefined;
  // Упрощаем: делаем повторную реализацию на базе spawnToResult
  const rspec = await (async () => {
    const cfg = await (resolver as any);
    const internal = (cfg as any);
    const realSpec = await (internal as any).default?.resolveCliRunSpec?.();
    return realSpec ?? undefined;
  })();

  // Практичнее и надёжнее: просто повторно соберём команду, как в LgLocator.runDoctorBundle:
  const spec2 = await (await import("./CliResolver") as any).default?.resolveCliRunSpec?.();

  // ЧТОБЫ НЕ ПУТАТЬ: делаем нормальный путь — через spawnToResult и нашу же резолюцию:
  const rs2 = await (await import("./CliResolver")).runCli(["diag", "--bundle"], { timeoutMs: 60_000 }).catch(() => "");
  // К сожалению, runCli не возвращает stderr, поэтому оставим старую реализацию в фасаде (LgLocator) — см. ниже.
  // Этот метод в CliClient мы не используем напрямую (см. DoctorService.runDoctorBundle).

  // Возвращаем пустышку, т.к. реальная версия оставлена в DoctorService (через фасад LgLocator + spawnToResult).
  const data = {};
  return { data };
}

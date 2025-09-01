import { cliDiag } from "../cli/CliClient";
import { spawnToResult } from "../runner/LgProcess";
import { effectiveWorkspaceRoot } from "../cli/CliResolver";

/** JSON-диагностика (без bundle) */
export async function runDoctorJson(opts?: { rebuild?: boolean }): Promise<any> {
  return cliDiag(opts?.rebuild);
}

/** Диагностика с построением бандла — нужен stderr, поэтому здесь отдельный вызов процесса. */
export async function runDoctorBundle(): Promise<{ data: any; bundlePath?: string }> {
  // Воспользуемся той же стратегией, что в старом LgLocator: соберём точную команду через «list diag --bundle».
  // Но нам нужен stderr — поэтому запускаем «вручную».
  const { default: cp } = await import("child_process"); // динамический import для безопасной сборки
  const { runCli } = await import("../cli/CliResolver");

  // Хитрость: reuse runCli, но нам нужен stderr. Поэтому повторим spawnToResult-путь:
  const specMod = await import("../cli/CliResolver");
  const anySpec = (specMod as any);
  // Получить RunSpec напрямую нельзя (приватно), поэтому построим команду снова:
  const which = process.platform === "win32" ? "where" : "which";
  let cmd = "listing-generator";
  try {
    const { spawnSync } = await import("child_process");
    const res = spawnSync(which, [cmd], { shell: process.platform === "win32" });
    if (res.status !== 0) cmd = ""; // не нашли; см. дальше
  } catch { /* ignore */ }

  // Если явного бинаря нет — используем python -m / managed venv через ту же логику, что runCli.
  // Чтобы не дублировать код, пойдём прямым путём: попросим runCli выполнить команду и перезапустим вручную с теми же аргами.
  // Итог: просто вызываем spawnToResult на "diag --bundle" через системную оболочку.
  const args = ["diag", "--bundle"];
  const { stdout, stderr } = await spawnToResult(cmd || "listing-generator", args, {
    shell: process.platform === "win32",
    cwd: effectiveWorkspaceRoot(),
    timeout: 60_000,
  });

  const data = JSON.parse(stdout || "{}");
  const m = /Diagnostic bundle written to:\s*(.+)\s*$/m.exec(stderr || "");
  const bundlePath = m ? m[1].trim() : undefined;
  return { data, bundlePath };
}

import { cliDiag } from "../cli/CliClient";
import { runCliResult } from "../cli/CliResolver";

/** JSON-диагностика (без bundle) */
export async function runDoctorJson(opts?: { rebuild?: boolean }): Promise<any> {
  return cliDiag(opts?.rebuild);
}

/** Диагностика с построением бандла — нужен stderr, поэтому здесь отдельный вызов процесса. */
export async function runDoctorBundle(): Promise<{ data: any; bundlePath?: string }> {
  // Используем общий резолвер, который умеет возвращать stdout+stderr
  const { stdout, stderr } = await runCliResult(["diag", "--bundle"], { timeoutMs: 60_000 });
  let data: any = {};
  try {
    data = JSON.parse(stdout || "{}");
  } catch (e) {
    // если JSON сломан, обернём ошибку с полезным stderr
    throw new Error(`LG Doctor: unexpected CLI output (not JSON). STDERR:\n${stderr || "(empty)"}`);
  }
  // Путь к zip печатается в stderr; спарсим по знакомой строке.
  const re = /Diagnostic bundle written to:\s*(.+)\s*$/m;
  const m = re.exec(stderr || "");
  const bundlePath = m ? m[1].trim() : undefined;
  return { data, bundlePath };
}

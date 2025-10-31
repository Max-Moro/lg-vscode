import * as path from "path";
import * as fs from "fs/promises";
import * as child_process from "child_process";
import { getWorkingDirectory, getClaudeProjectDir } from "./common";

/**
 * Способ интеграции: Headless запрос + замена контента в существующем файле
 *
 * Преимущества:
 * - Гарантированно совместимый формат (Claude сам создаёт структуру)
 * - Автоматически адаптируется к изменениям формата
 *
 * Недостатки:
 * - Дополнительный headless запрос (может быть долгим по времени)
 */
export async function createSessionFromHeadless(
  content: string,
  scope?: string
): Promise<string> {
  const { logDebug } = await import("../../../../logging/log");
  const cwd = await getWorkingDirectory(scope);
  const projectDir = await getClaudeProjectDir(scope);

  // Получаем список файлов ДО вызова
  let filesBefore: string[] = [];
  try {
    filesBefore = await fs.readdir(projectDir);
  } catch (e) {
    filesBefore = [];
  }

  // Выполняем headless запрос с маркером
  const marker = "TEMP_PLACEHOLDER_FOR_REPLACEMENT";
  await new Promise<void>((resolve, reject) => {
    const proc = child_process.spawn('claude', ['-p', marker], {
      cwd,
      shell: true,
      windowsHide: true,
      timeout: 10000
    });

    // Собираем stdout/stderr чтобы процесс не блокировался
    proc.stdout?.on('data', () => {});
    proc.stderr?.on('data', () => {});

    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0 || code === null) resolve();
      else reject(new Error(`Headless call failed with code ${code}`));
    });
  });

  // Задержка для записи файлов
  await new Promise(resolve => setTimeout(resolve, 500));

  // Находим новый USER session файл (исключаем agent-*)
  const filesAfter = await fs.readdir(projectDir);
  const newFiles = filesAfter.filter(f =>
    !filesBefore.includes(f) &&
    f.endsWith('.jsonl') &&
    !f.startsWith('agent-')
  );

  if (newFiles.length === 0) {
    throw new Error('No new user session file created after headless call');
  }

  const sessionFile = newFiles[0];
  const sessionId = sessionFile.replace('.jsonl', '');
  logDebug(`[Claude CLI Headless] Created session: ${sessionId}`);

  // Заменяем маркер на реальный контент
  const sessionFilePath = path.join(projectDir, sessionFile);
  const fileContent = await fs.readFile(sessionFilePath, 'utf8');

  const escapedMarker = JSON.stringify(marker).slice(1, -1);
  const escapedContent = JSON.stringify(content).slice(1, -1);

  const pattern = new RegExp(
    `"content":"${escapedMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`,
    'g'
  );

  const modifiedContent = fileContent.replace(pattern, `"content":"${escapedContent}"`);
  await fs.writeFile(sessionFilePath, modifiedContent, 'utf8');

  return sessionId;
}

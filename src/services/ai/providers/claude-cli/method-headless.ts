import * as path from "path";
import * as fs from "fs/promises";
import * as child_process from "child_process";
import { getWorkingDirectory, getClaudeProjectDir } from "./common";

/**
 * Integration method: Headless request + content replacement in existing file
 *
 * Advantages:
 * - Guaranteed compatible format (Claude creates the structure itself)
 * - Automatically adapts to format changes
 *
 * Disadvantages:
 * - Additional headless request (can be time-consuming)
 */
export async function createSessionFromHeadless(
  content: string,
  scope?: string
): Promise<string> {
  const { logDebug } = await import("../../../../logging/log");
  const cwd = await getWorkingDirectory(scope);
  const projectDir = await getClaudeProjectDir(scope);

  // Get list of files BEFORE the call
  let filesBefore: string[] = [];
  try {
    filesBefore = await fs.readdir(projectDir);
  } catch (e) {
    filesBefore = [];
  }

  // Execute headless request with a marker
  const marker = "TEMP_PLACEHOLDER_FOR_REPLACEMENT";
  await new Promise<void>((resolve, reject) => {
    const proc = child_process.spawn('claude', ['-p', marker], {
      cwd,
      shell: true,
      windowsHide: true,
      timeout: 10000
    });

    // Consume stdout/stderr to prevent process from blocking
    proc.stdout?.on('data', () => {});
    proc.stderr?.on('data', () => {});

    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0 || code === null) resolve();
      else reject(new Error(`Headless call failed with code ${code}`));
    });
  });

  // Delay to allow files to be written
  await new Promise(resolve => setTimeout(resolve, 500));

  // Find the new USER session file (excluding agent-*)
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

  // Replace marker with actual content
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

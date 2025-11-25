import * as fs from "fs/promises";
import * as child_process from "child_process";
import * as crypto from "crypto";
import { getWorkingDirectory, getClaudeSessionPath } from "./common";

/**
 * Integration method: Manual metadata formation and synthetic session creation
 *
 * Advantages:
 * - Fast (no headless request)
 * - Independent of Claude Code state
 * - Full control
 *
 * Disadvantages:
 * - Potential fragility when format changes
 */
export async function createSessionManually(
  content: string,
  scope?: string
): Promise<string> {
  const { logDebug } = await import("../../../../logging/log");
  const cwd = await getWorkingDirectory(scope);

  // 1. Generate session ID
  const sessionId = crypto.randomUUID();
  logDebug(`[Claude CLI Manual] Generated session ID: ${sessionId}`);

  // 2. Get Claude Code version
  let version = "2.0.30"; // fallback
  try {
    const versionOutput = await new Promise<string>((resolve, reject) => {
      child_process.exec('claude --version', { timeout: 3000 }, (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout.trim());
      });
    });
    const match = versionOutput.match(/v?([\d.]+)/);
    if (match) {
      version = match[1];
    }
    logDebug(`[Claude CLI Manual] Detected version: ${version}`);
  } catch {
    logDebug(`[Claude CLI Manual] Failed to detect version, using fallback: ${version}`);
  }

  // 3. Get git branch
  let gitBranch = "";
  try {
    gitBranch = await new Promise<string>((resolve) => {
      child_process.exec('git branch --show-current', { cwd, timeout: 3000 }, (error, stdout) => {
        if (error) resolve("");
        else resolve(stdout.trim());
      });
    });
    logDebug(`[Claude CLI Manual] Detected git branch: ${gitBranch || "(none)"}`);
  } catch {
    logDebug(`[Claude CLI Manual] Failed to detect git branch`);
  }

  // 4. Create JSONL session
  const snapshotUuid = crypto.randomUUID();
  const userMessageUuid = crypto.randomUUID();
  const now = new Date().toISOString();

  const snapshot = {
    type: "file-history-snapshot",
    messageId: snapshotUuid,
    snapshot: {
      messageId: snapshotUuid,
      trackedFileBackups: {},
      timestamp: now
    },
    isSnapshotUpdate: false
  };

  const userMessage = {
    parentUuid: null,
    isSidechain: false,
    userType: "external",
    cwd: cwd,
    sessionId: sessionId,
    version: version,
    gitBranch: gitBranch,
    type: "user",
    message: {
      role: "user",
      content: content
    },
    uuid: userMessageUuid,
    timestamp: now,
    thinkingMetadata: {
      level: "high",
      disabled: false,
      triggers: []
    }
  };

  const jsonlContent = [
    JSON.stringify(snapshot),
    JSON.stringify(userMessage)
  ].join('\n') + '\n';

  // 5. Write file
  const sessionFilePath = await getClaudeSessionPath(sessionId, scope);
  const path = await import("path");
  const dirPath = path.dirname(sessionFilePath);
  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(sessionFilePath, jsonlContent, 'utf8');

  logDebug(`[Claude CLI Manual] Session file created: ${sessionFilePath}`);

  return sessionId;
}

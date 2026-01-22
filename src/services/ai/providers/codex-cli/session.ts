import * as path from "path";
import * as fs from "fs/promises";
import type { ShellType } from "../../../../models/ShellType";
import type { CodexReasoningEffort } from "../../../../models/CodexReasoningEffort";
import {
  getCodexHome,
  getCodexVersion,
  generateUuidV7,
  formatFileTimestamp,
  addToHistoryIndex
} from "./common";

export interface CodexSessionParams {
  content: string;
  cwd: string;
  shell: ShellType;
  reasoningEffort: CodexReasoningEffort;
  approvalPolicy: "on-request";
  sandboxMode: "read-only" | "workspace-write";
}

/**
 * Create a new Codex session with the given content
 */
export async function createCodexSession(params: CodexSessionParams): Promise<string> {
  const { logDebug } = await import("../../../../logging/log");

  // 1. Generate session ID (UUID v7)
  const sessionId = generateUuidV7();
  logDebug(`[Codex Session] Generated session ID: ${sessionId}`);

  // 2. Get timestamps
  const now = new Date();
  const isoTimestamp = now.toISOString();
  const fileTimestamp = formatFileTimestamp(now);

  // 3. Build session directory path
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const sessionDir = path.join(getCodexHome(), "sessions", String(year), month, day);

  // 4. Create directory if not exists
  await fs.mkdir(sessionDir, { recursive: true });

  // 5. Build session file path
  const fileName = `rollout-${fileTimestamp}-${sessionId}.jsonl`;
  const sessionFilePath = path.join(sessionDir, fileName);
  logDebug(`[Codex Session] Session file: ${sessionFilePath}`);

  // 6. Get CLI version
  const cliVersion = await getCodexVersion();

  // 7. Build JSONL records
  const records = [
    buildSessionMeta(sessionId, isoTimestamp, params.cwd, cliVersion),
    buildDeveloperMessage(isoTimestamp, params.approvalPolicy, params.sandboxMode),
    buildEnvironmentContext(isoTimestamp, params.cwd, params.shell),
    buildUserMessage(isoTimestamp, params.content),
    buildUserMessageEvent(isoTimestamp, params.content),
    buildTurnContext(isoTimestamp, params)
  ];

  // 8. Write session file
  const jsonlContent = records.map(r => JSON.stringify(r)).join("\n") + "\n";
  await fs.writeFile(sessionFilePath, jsonlContent, "utf8");
  logDebug(`[Codex Session] Session file written`);

  // 9. Update history.jsonl
  await addToHistoryIndex({
    sessionId,
    timestamp: now.getTime(),
    text: params.content
  });
  logDebug(`[Codex Session] History index updated`);

  return sessionId;
}

function buildSessionMeta(
  sessionId: string,
  timestamp: string,
  cwd: string,
  cliVersion: string
) {
  return {
    timestamp,
    type: "session_meta",
    payload: {
      id: sessionId,
      timestamp,
      cwd,
      originator: "lg_vscode_extension",
      cli_version: cliVersion,
      source: "cli"
      // instructions and model_provider use Codex CLI defaults
    }
  };
}

function buildDeveloperMessage(
  timestamp: string,
  approvalPolicy: string,
  sandboxMode: string
) {
  const sandboxText = sandboxMode === "read-only"
    ? "The sandbox only permits reading files. Network access is restricted."
    : "The sandbox permits writing to the workspace.";

  return {
    timestamp,
    type: "response_item",
    payload: {
      type: "message",
      role: "developer",
      content: [{
        type: "input_text",
        text: `<permissions instructions>Filesystem sandboxing defines which files can be read or written. \`sandbox_mode\` is \`${sandboxMode}\`: ${sandboxText} \`approval_policy\` is \`${approvalPolicy}\`: Commands will be run in the sandbox by default.</permissions instructions>`
      }]
    }
  };
}

function buildEnvironmentContext(timestamp: string, cwd: string, shell: ShellType) {
  return {
    timestamp,
    type: "response_item",
    payload: {
      type: "message",
      role: "user",
      content: [{
        type: "input_text",
        text: `<environment_context>\n  <cwd>${cwd}</cwd>\n  <shell>${shell}</shell>\n</environment_context>`
      }]
    }
  };
}

function buildUserMessage(timestamp: string, content: string) {
  return {
    timestamp,
    type: "response_item",
    payload: {
      type: "message",
      role: "user",
      content: [{
        type: "input_text",
        text: content
      }]
    }
  };
}

function buildUserMessageEvent(timestamp: string, content: string) {
  return {
    timestamp,
    type: "event_msg",
    payload: {
      type: "user_message",
      message: content,
      images: [],
      local_images: [],
      text_elements: []
    }
  };
}

function buildTurnContext(timestamp: string, params: CodexSessionParams) {
  return {
    timestamp,
    type: "turn_context",
    payload: {
      cwd: params.cwd,
      approval_policy: params.approvalPolicy,
      sandbox_policy: { type: params.sandboxMode },
      effort: params.reasoningEffort
      // Other fields (model, summary, truncation_policy) use Codex CLI defaults
    }
  };
}

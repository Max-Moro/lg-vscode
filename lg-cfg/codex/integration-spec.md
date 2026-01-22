# OpenAI Codex CLI Integration Specification

> Technical specification for implementing Codex CLI provider in LG VS Code extension.

---

## Overview

Integration with **OpenAI Codex CLI** via session-based method (manual JSONL creation).

**Similar to**: Claude Code integration (`src/services/ai/providers/claude-cli/`)

**Single method**: Session creation (no memory-file alternative needed)

---

## Architecture

### New Files to Create

```
src/
├── models/
│   └── CodexReasoningEffort.ts       # Reasoning effort enum and helpers
├── services/ai/providers/
│   └── codex-cli/
│       ├── index.ts                  # Module exports
│       ├── detector.ts               # CLI availability detection
│       ├── provider.ts               # Main CodexCliProvider class
│       ├── session.ts                # Session creation logic
│       └── common.ts                 # Shared utilities
```

### Files to Modify

```
src/
├── constants.ts                      # Add CODEX_SESSION_LOCK_FILE
├── models/
│   └── ShellType.ts                  # (no changes, reuse existing)
├── services/
│   ├── ControlStateService.ts        # Add codexReasoningEffort field
│   └── ai/
│       ├── index.ts                  # Register codex-cli provider
│       └── types.ts                  # (no changes)
├── webview/
│   └── control-panel related         # Add reasoning effort selector
```

---

## Data Models

### CodexReasoningEffort (`src/models/CodexReasoningEffort.ts`)

```typescript
/**
 * Codex reasoning effort levels
 */
export type CodexReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";

export interface CodexReasoningEffortDescriptor {
  id: CodexReasoningEffort;
  label: string;
  description: string;
}

export function getDefaultCodexReasoningEffort(): CodexReasoningEffort {
  return "medium";
}

export function getAvailableCodexReasoningEfforts(): CodexReasoningEffortDescriptor[] {
  return [
    { id: "minimal", label: "Minimal", description: "Fastest, least thorough" },
    { id: "low", label: "Low", description: "Quick tasks" },
    { id: "medium", label: "Medium", description: "Balanced (default)" },
    { id: "high", label: "High", description: "Complex tasks" },
    { id: "xhigh", label: "Extra High", description: "Most thorough, slowest" }
  ];
}
```

### ControlPanelState Extension

Add to `ControlPanelState` interface in `src/services/ControlStateService.ts`:

```typescript
export interface ControlPanelState {
  // ... existing fields ...

  // Codex CLI settings
  codexReasoningEffort: CodexReasoningEffort;
}
```

---

## Provider Implementation

### Detector (`src/services/ai/providers/codex-cli/detector.ts`)

```typescript
import * as cp from "child_process";
import type { ProviderDetector } from "../../types";

export const detector: ProviderDetector = {
  priority: 45,  // Slightly lower than Claude CLI (50)

  async detect(): Promise<boolean> {
    try {
      const cmd = process.platform === "win32" ? "where" : "which";
      const result = cp.spawnSync(cmd, ["codex"], { stdio: "ignore", timeout: 4000 });
      return result.status === 0;
    } catch {
      return false;
    }
  }
};
```

### Provider (`src/services/ai/providers/codex-cli/provider.ts`)

Extends `BaseCliProvider` similar to Claude CLI provider.

**Key differences from Claude:**
- Uses `codex resume SESSION_ID` instead of `claude -r`
- Different approval/sandbox argument names
- Reasoning effort as additional parameter
- Different session file structure

### Mode Mapping

| AiInteractionMode | Codex Arguments |
|-------------------|-----------------|
| `ASK` | `--sandbox read-only --ask-for-approval on-request` |
| `AGENT` | `--sandbox workspace-write --ask-for-approval on-request` |

### Lock File

Constant in `src/constants.ts`:
```typescript
export const CODEX_SESSION_LOCK_FILE = ".codex-session.lock";
```

---

## Session Creation

### Project Binding Mechanism

**Key difference from Claude Code:**
- Claude Code: sessions stored in `~/.claude/projects/{encoded_path}/` — path encoded in directory name
- Codex: all sessions in `~/.codex/sessions/YYYY/MM/DD/` — project binding via `cwd` field in session_meta

**How Codex filters sessions:**
- `codex resume` — shows only sessions where `cwd` matches current directory
- `codex resume --last` — most recent from current directory
- `codex resume --all` — all sessions regardless of directory
- `codex resume SESSION_ID` — opens specific session (no cwd check)

**Critical for integration:**
The `cwd` field in `session_meta` is the key for project association. Must be set correctly!

### Session File Structure

**Path pattern**: `~/.codex/sessions/YYYY/MM/DD/rollout-{ISO_timestamp}-{session_id}.jsonl`

**Example**: `rollout-2026-01-22T08-15-11-019be3b2-e764-72e1-a9e1-745e549e0201.jsonl`

### Required JSONL Records

Minimum records for valid session:

1. **session_meta** — session metadata
2. **response_item (developer)** — permissions instructions
3. **response_item (user)** — AGENTS.md instructions (optional)
4. **response_item (user)** — environment context
5. **response_item (user)** — actual user prompt (LG content)
6. **event_msg (user_message)** — user message event
7. **turn_context** — turn configuration

### Session Creation Algorithm (`session.ts`)

```typescript
interface CodexSessionParams {
  content: string;
  cwd: string;
  shell: ShellType;
  reasoningEffort: CodexReasoningEffort;
  approvalPolicy: "on-request";
  sandboxMode: "read-only" | "workspace-write";
}

async function createCodexSession(params: CodexSessionParams): Promise<string> {
  // 1. Generate UUID v7 for session_id
  const sessionId = generateUuidV7();

  // 2. Get current timestamp in ISO format
  const now = new Date();
  const isoTimestamp = now.toISOString();
  const fileTimestamp = formatFileTimestamp(now); // 2026-01-22T08-15-11

  // 3. Build session directory path
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const sessionDir = path.join(getCodexHome(), 'sessions', String(year), month, day);

  // 4. Create directory if not exists
  await fs.mkdir(sessionDir, { recursive: true });

  // 5. Build session file path
  const fileName = `rollout-${fileTimestamp}-${sessionId}.jsonl`;
  const sessionFilePath = path.join(sessionDir, fileName);

  // 6. Get CLI version
  const cliVersion = await getCodexVersion();

  // 7. Build JSONL records
  const records = [
    buildSessionMeta(sessionId, isoTimestamp, params.cwd, cliVersion),
    buildDeveloperMessage(params.approvalPolicy, params.sandboxMode),
    buildEnvironmentContext(params.cwd, params.shell),
    buildUserMessage(params.content),
    buildUserMessageEvent(params.content),
    buildTurnContext(params)
  ];

  // 8. Write session file
  const jsonlContent = records.map(r => JSON.stringify(r)).join('\n') + '\n';
  await fs.writeFile(sessionFilePath, jsonlContent, 'utf8');

  // 9. Update history.jsonl
  await addToHistoryIndex(sessionId, now.getTime(), params.content, params.cwd);

  return sessionId;
}
```

### Record Builders

#### session_meta

```typescript
function buildSessionMeta(sessionId: string, timestamp: string, cwd: string, cliVersion: string) {
  return {
    timestamp,
    type: "session_meta",
    payload: {
      id: sessionId,
      timestamp,
      cwd,
      originator: "lg_vscode_extension",
      cli_version: cliVersion,
      instructions: "",  // Will be populated by Codex on resume
      source: "cli",
      model_provider: "openai"
    }
  };
}
```

#### Developer Message (permissions)

```typescript
function buildDeveloperMessage(approvalPolicy: string, sandboxMode: string) {
  const sandboxText = sandboxMode === "read-only"
    ? "The sandbox only permits reading files."
    : "The sandbox permits writing to the workspace.";

  return {
    timestamp: new Date().toISOString(),
    type: "response_item",
    payload: {
      type: "message",
      role: "developer",
      content: [{
        type: "input_text",
        text: `<permissions instructions>Filesystem sandboxing defines which files can be read or written. \`sandbox_mode\` is \`${sandboxMode}\`: ${sandboxText} \`approval_policy\` is \`${approvalPolicy}\`.</permissions instructions>`
      }]
    }
  };
}
```

#### Environment Context

```typescript
function buildEnvironmentContext(cwd: string, shell: ShellType) {
  return {
    timestamp: new Date().toISOString(),
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
```

#### User Message

```typescript
function buildUserMessage(content: string) {
  return {
    timestamp: new Date().toISOString(),
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
```

#### User Message Event

```typescript
function buildUserMessageEvent(content: string) {
  return {
    timestamp: new Date().toISOString(),
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
```

#### Turn Context

```typescript
function buildTurnContext(params: CodexSessionParams) {
  return {
    timestamp: new Date().toISOString(),
    type: "turn_context",
    payload: {
      cwd: params.cwd,
      approval_policy: params.approvalPolicy,
      sandbox_policy: { type: params.sandboxMode },
      model: "gpt-5.2-codex",  // Default model
      effort: params.reasoningEffort,
      summary: "auto",
      user_instructions: "",
      truncation_policy: { mode: "tokens", limit: 10000 }
    }
  };
}
```

### History Index Update

```typescript
async function addToHistoryIndex(
  sessionId: string,
  timestamp: number,
  text: string,
  cwd: string
): Promise<void> {
  const historyPath = path.join(getCodexHome(), 'history.jsonl');

  const entry = {
    session_id: sessionId,
    ts: Math.floor(timestamp / 1000),  // Unix timestamp in seconds
    text: truncateForDisplay(text, 500)
  };

  const line = JSON.stringify(entry) + '\n';
  await fs.appendFile(historyPath, line, 'utf8');
}
```

---

## Terminal Execution

### Command Building

```typescript
function buildCodexCommand(
  sessionId: string,
  shell: ShellType,
  lockFile: string,
  reasoningEffort: CodexReasoningEffort
): string {
  // Build the main codex command
  const reasoningArg = reasoningEffort !== "medium"
    ? ` --config 'model_reasoning_effort="${reasoningEffort}"'`
    : "";

  let codexCmd = `codex resume "${sessionId}"${reasoningArg}`;

  // Add cleanup depending on shell
  switch (shell) {
    case "powershell":
      return `try { ${codexCmd} } finally { Remove-Item "${lockFile}" -EA SilentlyContinue }`;

    case "cmd":
      return `${codexCmd} & if exist "${lockFile}" del /q "${lockFile}"`;

    case "bash":
    case "zsh":
    case "sh":
    default:
      return `(trap "rm -f \\"${lockFile}\\"" EXIT INT TERM HUP; ${codexCmd})`;
  }
}
```

### Provider Execute Method

```typescript
protected async executeInTerminal(
  content: string,
  terminal: vscode.Terminal,
  ctx: CliExecutionContext
): Promise<void> {
  const { logDebug } = await import("../../../../logging/log");
  const fs = await import("fs/promises");

  // Get reasoning effort from state
  const reasoningEffort = await this.getReasoningEffort();

  // Determine sandbox mode from AI interaction mode
  const sandboxMode = ctx.mode === AiInteractionMode.ASK
    ? "read-only"
    : "workspace-write";

  const cwd = await getWorkingDirectory(ctx.scope);

  logDebug(`[Codex CLI] Creating session with reasoning effort: ${reasoningEffort}`);

  // Create session
  const sessionId = await createCodexSession({
    content,
    cwd,
    shell: ctx.shell,
    reasoningEffort,
    approvalPolicy: "on-request",
    sandboxMode
  });

  logDebug(`[Codex CLI] Session created: ${sessionId}`);

  // Create lock file
  const lockFilePath = await getWorkspacePath(CODEX_SESSION_LOCK_FILE, ctx.scope);
  try {
    await fs.writeFile(lockFilePath, "", "utf8");
    logDebug(`[Codex CLI] Lock file created: ${CODEX_SESSION_LOCK_FILE}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logWarn(`[Codex CLI] Failed to create lock file: ${errorMessage}`);
  }

  // Build and execute command
  const codexCommand = buildCodexCommand(
    sessionId,
    ctx.shell,
    CODEX_SESSION_LOCK_FILE,
    reasoningEffort
  );

  logDebug(`[Codex CLI] Sending command: ${codexCommand}`);
  terminal.sendText(codexCommand, true);

  vscode.window.showInformationMessage(
    `Codex CLI session started. Check the terminal.`
  );
}
```

---

## UI Changes

### Control Panel State

Add `codexReasoningEffort` field with default value `"medium"`.

### WebView Control Panel

Add reasoning effort selector, visible when Codex CLI provider is selected.

**UI Element**: Dropdown/Select with 5 options (Minimal, Low, Medium, High, Extra High)

**Visibility condition**: `lg.ai.provider === "codex.cli"`

---

## Provider Registration

### Index Export (`src/services/ai/providers/codex-cli/index.ts`)

```typescript
export { provider } from "./provider";
export { detector } from "./detector";
```

### Service Registration (`src/services/ai/index.ts`)

```typescript
import * as codexCli from "./providers/codex-cli";

const ALL_PROVIDERS: ProviderModule[] = [
  clipboard,
  copilot,
  cursor,
  claudeCli,
  codexCli,  // Add here
  openai,
];
```

### Settings Configuration (`package.json`)

Add to `lg.ai.provider` enum:

```json
{
  "lg.ai.provider": {
    "enum": [
      "clipboard",
      "github.copilot",
      "cursor.composer",
      "claude.cli",
      "codex.cli",      // Add
      "openai.api"
    ],
    "enumDescriptions": [
      "Copy to clipboard",
      "GitHub Copilot Chat (requires extension)",
      "Cursor Composer (requires Cursor IDE)",
      "Claude CLI (requires claude command in PATH)",
      "OpenAI Codex CLI (requires codex command in PATH)",  // Add
      "OpenAI API"
    ]
  }
}
```

---

## Helper Functions

### UUID v7 Generation

```typescript
/**
 * Generate UUID v7 (time-ordered)
 * Format: xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
 */
function generateUuidV7(): string {
  const now = Date.now();
  const bytes = new Uint8Array(16);

  // Timestamp (48 bits)
  bytes[0] = (now / 0x10000000000) & 0xff;
  bytes[1] = (now / 0x100000000) & 0xff;
  bytes[2] = (now / 0x1000000) & 0xff;
  bytes[3] = (now / 0x10000) & 0xff;
  bytes[4] = (now / 0x100) & 0xff;
  bytes[5] = now & 0xff;

  // Random bits
  crypto.getRandomValues(bytes.subarray(6));

  // Version 7
  bytes[6] = (bytes[6] & 0x0f) | 0x70;

  // Variant
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return formatUuid(bytes);
}
```

### Codex Home Directory

```typescript
function getCodexHome(): string {
  return process.platform === "win32"
    ? path.join(process.env.USERPROFILE || "", ".codex")
    : path.join(process.env.HOME || "", ".codex");
}
```

### Codex Version

```typescript
async function getCodexVersion(): Promise<string> {
  try {
    const output = await new Promise<string>((resolve, reject) => {
      child_process.exec('codex --version', { timeout: 3000 }, (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout.trim());
      });
    });
    const match = output.match(/v?([\d.]+)/);
    return match ? match[1] : "0.88.0";
  } catch {
    return "0.88.0";  // Fallback version
  }
}
```

---

## Testing Checklist

1. [ ] Detector correctly identifies `codex` command in PATH
2. [ ] Session file created in correct directory structure
3. [ ] Session file contains all required JSONL records
4. [ ] `codex resume` successfully opens created session
5. [ ] History index updated correctly
6. [ ] Lock file created and cleaned up on exit
7. [ ] Reasoning effort parameter passed correctly
8. [ ] Mode mapping (ASK/AGENT) works correctly
9. [ ] Terminal busy detection with lock file works
10. [ ] Works on Windows (PowerShell) and Unix (bash/zsh)

---

## Notes

- No model selection in UI (versions change frequently)
- Single integration method (session only, no memory-file)
- Reasoning effort defaults to "medium" if not specified
- Lock file `.codex-session.lock` created in workspace root (or scope)

# OpenAI Codex CLI Reference

> Internal documentation for LG VS Code extension integration with OpenAI Codex CLI.

---

## Overview

**OpenAI Codex CLI** is a terminal-based AI coding assistant from OpenAI. It provides agentic capabilities similar to Claude Code but with different architecture and configuration options.

**Current version**: 0.88.0 (as of January 2026)

**Config location**: `~/.codex/` (Windows: `%USERPROFILE%\.codex\`)

---

## CLI Arguments Reference

### Global Flags

| Flag | Type | Description |
|------|------|-------------|
| `--model, -m` | string | Override configured model (e.g., `gpt-5.2-codex`) |
| `--ask-for-approval, -a` | enum | Control approval pausing: `untrusted`, `on-failure`, `on-request`, `never` |
| `--sandbox, -s` | enum | Sandbox policy: `read-only`, `workspace-write`, `danger-full-access` |
| `--config, -c` | key=value | Override configuration values |
| `--cd, -C` | path | Set working directory |
| `--image, -i` | path | Attach image files to initial prompt |
| `--profile, -p` | string | Load configuration profile |
| `--full-auto` | boolean | Low-friction mode with preset sandbox/approval settings |
| `--no-alt-screen` | boolean | Disable alternate screen mode for TUI |
| `--search` | boolean | Enable web search |
| `--oss` | boolean | Use local open source model provider (requires Ollama) |
| `PROMPT` | string | Optional initial instruction |

### Session Management Commands

| Command | Description |
|---------|-------------|
| `codex` | Launch interactive TUI |
| `codex resume` | Continue previous interactive session |
| `codex resume --last` | Resume most recent session |
| `codex resume SESSION_ID` | Resume specific session by UUID |
| `codex fork` | Branch a previous session into new thread |
| `codex exec` | Non-interactive execution |
| `codex exec resume` | Continue non-interactive session |

### Non-Interactive Mode (`codex exec`)

| Flag | Description |
|------|-------------|
| `--json` | Output newline-delimited JSON events |
| `--output-last-message, -o` | Write final message to file |
| `--output-schema` | JSON Schema for response validation |
| `--color` | Control ANSI color output: `always`, `never`, `auto` |

---

## Configuration Reference

### Config File Location

- **User config**: `~/.codex/config.toml`
- **Admin constraints**: `requirements.toml`

### Model Configuration

| Option | Values | Description |
|--------|--------|-------------|
| `model` | string | Model identifier (e.g., `gpt-5.2-codex`) |
| `model_provider` | string | Provider ID, defaults to `openai` |
| `model_context_window` | number | Token limit for active model |

### Reasoning Settings

| Option | Values | Description |
|--------|--------|-------------|
| `model_reasoning_effort` | `minimal`, `low`, `medium`, `high`, `xhigh` | Reasoning depth level |
| `model_reasoning_summary` | `auto`, `concise`, `detailed`, `none` | Reasoning summary detail |
| `model_verbosity` | `low`, `medium`, `high` | GPT-5 Responses API verbosity |
| `show_raw_agent_reasoning` | boolean | Show unprocessed reasoning |
| `hide_agent_reasoning` | boolean | Suppress reasoning in output |

### Approval & Sandbox Policies

| Option | Values | Description |
|--------|--------|-------------|
| `approval_policy` | `untrusted`, `on-failure`, `on-request`, `never` | When to pause for approval |
| `sandbox_mode` | `read-only`, `workspace-write`, `danger-full-access` | Filesystem access policy |

---

## Slash Commands

| Command | Description |
|---------|-------------|
| `/model` | Choose active model and reasoning effort |
| `/status` | Display session config and token usage |
| `/approvals` | Set approval permissions mid-session |
| `/resume` | Resume a saved conversation |
| `/fork` | Fork conversation into new thread |
| `/new` | Start new conversation in same session |
| `/compact` | Summarize conversation to free tokens |
| `/diff` | Show Git diff including untracked files |
| `/mention` | Attach file to conversation |
| `/review` | Request code review |
| `/mcp` | List configured MCP tools |
| `/init` | Generate AGENTS.md scaffold |
| `/feedback` | Send logs to maintainers |
| `/logout` | Sign out |
| `/quit`, `/exit` | Exit CLI |

---

## Session Storage Structure

### Directory Layout

```
~/.codex/
├── auth.json                 # Authentication credentials
├── config.toml               # User configuration
├── history.jsonl             # Session history index
├── models_cache.json         # Cached model list
├── version.json              # Version tracking
├── sessions/
│   └── YYYY/
│       └── MM/
│           └── DD/
│               └── rollout-{timestamp}-{session_id}.jsonl
├── skills/                   # Installed skills
├── log/                      # Debug logs
└── tmp/                      # Temporary files
```

### Session File Format

**Filename**: `rollout-{ISO_date}T{time}-{session_id}.jsonl`

**Example**: `rollout-2026-01-22T08-15-11-019be3b2-e764-72e1-a9e1-745e549e0201.jsonl`

**Session ID format**: UUID v7

### JSONL Record Types

Each line is a JSON object with `timestamp`, `type`, and `payload` fields.

#### `session_meta`

First record in session file. Contains session metadata.

```json
{
  "timestamp": "2026-01-22T03:15:11.357Z",
  "type": "session_meta",
  "payload": {
    "id": "019be3b2-e764-72e1-a9e1-745e549e0201",
    "timestamp": "2026-01-22T03:15:11.332Z",
    "cwd": "F:\\workspace\\project",
    "originator": "codex_cli_rs",
    "cli_version": "0.87.0",
    "instructions": "...",
    "source": "cli",
    "model_provider": "openai"
  }
}
```

#### `response_item`

Dialogue elements: messages, reasoning, function calls.

**Message types**:
- `message` with role: `developer`, `user`, `assistant`
- `reasoning` with summary and encrypted content
- `function_call` with name, arguments, call_id
- `function_call_output` with call_id and output

```json
{
  "timestamp": "2026-01-22T03:16:07.663Z",
  "type": "response_item",
  "payload": {
    "type": "message",
    "role": "user",
    "content": [{"type": "input_text", "text": "User message here"}]
  }
}
```

#### `event_msg`

Events during execution.

**Event types**:
- `user_message` - user input
- `agent_message` - assistant output
- `agent_reasoning` - reasoning summary
- `token_count` - token usage statistics

```json
{
  "timestamp": "2026-01-22T03:16:25.300Z",
  "type": "event_msg",
  "payload": {
    "type": "agent_message",
    "message": "Assistant response text"
  }
}
```

#### `turn_context`

Context for each turn. Contains policies and model settings.

```json
{
  "timestamp": "2026-01-22T03:16:07.663Z",
  "type": "turn_context",
  "payload": {
    "cwd": "F:\\workspace\\project",
    "approval_policy": "on-request",
    "sandbox_policy": {"type": "read-only"},
    "model": "gpt-5.2-codex",
    "effort": "low",
    "summary": "auto",
    "user_instructions": "..."
  }
}
```

### History Index (`history.jsonl`)

Contains user prompts for session discovery.

```json
{
  "session_id": "019be3b2-e764-72e1-a9e1-745e549e0201",
  "ts": 1768982040,
  "text": "User prompt text here"
}
```

---

## Available Models

Based on `/model` command output:

| Model | Description |
|-------|-------------|
| `gpt-5.2-codex` | Latest frontier agentic coding model |
| `gpt-5.2` | Latest frontier model with improvements |
| `gpt-5.1-codex-max` | Codex-optimized flagship for deep and fast reasoning |
| `gpt-5.1-codex-mini` | Optimized for codex, cheaper and faster |

---

## Key Differences from Claude Code

| Aspect | Codex CLI | Claude Code |
|--------|-----------|-------------|
| Session path | `~/.codex/sessions/YYYY/MM/DD/` | `~/.claude/projects/{encoded_path}/` |
| Session filename | `rollout-{timestamp}-{uuid}.jsonl` | `{uuid}.jsonl` |
| Resume command | `codex resume SESSION_ID` | `claude -r SESSION_ID` |
| Approval modes | `untrusted`, `on-failure`, `on-request`, `never` | `plan`, `acceptEdits` |
| Reasoning control | `model_reasoning_effort` (5 levels) | N/A (built into model) |
| Config format | TOML | TOML |
| Instructions file | `AGENTS.md` | `CLAUDE.md` |

---

## Integration Considerations for LG VS Code Extension

### Mode Mapping (AiInteractionMode)

| LG Mode | Codex Approval Policy | Codex Sandbox |
|---------|----------------------|---------------|
| `ASK` | `on-request` | `read-only` |
| `AGENT` | `on-request` | `workspace-write` |

### Reasoning Effort

Consider exposing `model_reasoning_effort` in UI:
- `minimal` - fastest, least thorough
- `low` - quick tasks
- `medium` - balanced (default)
- `high` - complex tasks
- `xhigh` - most thorough, slowest

### Session Creation

For manual session creation:
1. Generate UUID v7 for session_id
2. Create directory structure: `~/.codex/sessions/YYYY/MM/DD/`
3. Create file: `rollout-{ISO_timestamp}-{session_id}.jsonl`
4. Write `session_meta` record
5. Write initial `response_item` records (developer, user)
6. Write `turn_context` record
7. Launch with `codex resume {session_id}`

### Lock File Strategy

Unlike Claude Code, Codex doesn't seem to use lock files. Consider:
- Using presence of active terminal as busy indicator
- Creating custom lock file mechanism similar to Claude integration

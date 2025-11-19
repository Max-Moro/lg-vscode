# Listing Generator — VS Code Extension

> Interactive UI for working with Listing Generator CLI: context generation, section management, sending to AI — all in the familiar VS Code interface.

---

## What is this

**VS Code Extension for [Listing Generator](https://github.com/Max-Moro/lg-cli/README.md)** — a graphical interface for the powerful CLI tool for creating AI contexts.

The extension automates routine tasks:
- **No need to remember commands** — all actions through panels and buttons
- **Visual configuration** — modes, tags, file filters in convenient forms
- **Instant sending to AI** — integration with Copilot, Cursor, Claude, OpenAI API from one button
- **Live statistics** — see context size and token usage before sending

---

## Key Features

### Control Panel
Central management panel:
- Selection of contexts and sections from `lg-cfg/`
- Adaptive settings: operation modes (ask/agent, planning/development/review), tag sets
- Dynamic description of current task (task context)
- Tokenization management (tiktoken, HuggingFace tokenizers, sentencepiece)

### AI Integration
Direct sending of contexts to AI:
- **Clipboard** — copying for any chat
- **GitHub Copilot** — sending to Copilot Chat
- **Cursor Composer** — integration with Cursor IDE
- **Claude CLI** — via terminal client
- **OpenAI API** — direct network sending (token storage via VS Code Secrets)

Automatic detection of available providers on first run.

### Visualization and Diagnostics
- **Included Files Tree** — tree of files included in the context after filtering
- **Stats Webview** — detailed statistics by tokens, file grouping, savings from adapters
- **Doctor** — environment diagnostics, `lg-cfg/` migrations, cache status

### Automation
- **Managed venv** — automatic CLI installation to isolated environment
- **Watcher on lg-cfg/** — live update of sections/contexts lists when configuration is edited
- **Config migrations** — built-in support for `lg-cfg/` format migrations (CLI compatibility)
<!-- lg:comment:start -->
---

## Quick Start

1. **Install the extension** from VS Code Marketplace (or from `.vsix` file)
2. **Open a project with `lg-cfg/`** — the extension will automatically activate
3. **First run**: Extension will offer to install CLI (via managed venv or system Python)
4. **Open the "LG — Control Panel"** in the Activity Bar sidebar
5. **Select a context/section**, configure modes and tags, click "Send to AI"

If you don't have `lg-cfg/` yet — use the **"LG: Create Starter Config"** command to initialize the standard structure.

---

## Documentation

- [Listing Generator CLI](https://github.com/Max-Moro/lg-cli/README.md) — main documentation on CLI and `lg-cfg/` format
- [Templates and Contexts](https://github.com/Max-Moro/lg-cli/docs/templates.md) — prompt templating
- [Adaptive Features](https://github.com/Max-Moro/lg-cli/docs/adaptability.md) — modes, tags, conditional logic
- [Language Adapters](https://github.com/Max-Moro/lg-cli/docs/adapters.md) — listing optimization

---

## Settings

Main parameters (Settings → Extensions → Listing Generator):
- `lg.ai.provider` — provider for sending to AI (clipboard, copilot, cursor, claude.cli, openai.api)
- `lg.install.strategy` — CLI installation strategy (managedVenv, system, pipx)
- `lg.python.interpreter` — path to Python interpreter (for managed venv)
- `lg.cli.path` — explicit path to CLI (if installed manually)
- `lg.openAsEditable` — open results as editable files (instead of read-only virtual documents)
<!-- lg:comment:end -->

---

## License

VS Code Extension for Listing Generator is licensed under the Apache License, Version 2.0.  
See the `LICENSE` file for the full license text.
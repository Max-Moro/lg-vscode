# Changelog

All notable changes to Listing Generator VS Code Extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
- OpenAI Codex CLI integration with session-based execution and reasoning effort configuration
- **AI provider selector in Control Panel**
  - Provider selection moved from VS Code settings to Control Panel
  - Automatic detection of available providers at startup
- **"Update AI Modes Template" command** for automatic generation of `ai-interaction.sec.yaml`
  - Supports custom modes and provider launch arguments
- **"Reset UI to Defaults" command** to reset all Control Panel settings
- **Context-dependent storage of modes and tags** — settings are saved separately for each context + provider combination

### Changed
- Redesigned AI Contexts interface: context → task description → provider and action buttons
- "agent" mode is now selected by default for ai-interaction mode-set
- Updated default encoder values for tokenization libraries with auto-selection on library change
- Improved UX with automatic refresh of dependent dropdowns (sections, modes, tags, branches)
- Internal architecture refactored for improved stability and extensibility

### Fixed
- False positive FileWatcher triggers on auto-save without actual changes
- Incorrect validation when changing tokenization library or provider
- Resource leaks on extension deactivation

### Removed
- OpenAI API provider — CLI-based or extension-based providers are recommended
- "Open Config" command — obsolete for modern lg-cfg/ structures
- `lg.ai.provider` setting — replaced by Control Panel selector

## [0.10.0] - 2026-01-15

### Fixed
- CLI installation on Linux/macOS (pipx argument quoting)
- Claude Code integration via session files (path encoding)

### Changed
- Compatible with CLI ^0.10.0 — see [CLI changelog](https://github.com/Max-Moro/lg-cli/blob/main/CHANGELOG.md)

## [0.9.3] - 2025-11-25

### Added
- Control Panel with section/context selection
- Adaptive settings UI (modes, tags)
- Task text editor with stdin support
- Included Files tree view (tree/flat modes)
- Statistics webview with detailed metrics
- AI integration (clipboard, Copilot, Cursor, Claude CLI, OpenAI API)
- Managed CLI installation via isolated venv
- Doctor diagnostics panel
- Config watcher for live updates

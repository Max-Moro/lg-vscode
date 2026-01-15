# Changelog

All notable changes to Listing Generator VS Code Extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

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

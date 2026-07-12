# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-07-12

### Added
- MCP Servers — connect remote MCP servers (Streamable HTTP, with SSE fallback), sync tool catalogs, and attach them to agents via the agent flow canvas
- MCP Servers UI — list/sync servers, Cursor-format JSON config editor, and sidebar navigation
- Builtin `browser` tool — stealth headless Chromium (CloakBrowser) for navigate, click, fill, snapshot, screenshot, and related actions

### Changed
- Docker image installs Chromium deps and CloakBrowser so the builtin browser tool works in containers
- App data path centralized via `getDataDir()` (`DATA_DIR` or `~/.raw-agents`)

### Upgrade notes
- SQLite migrations `0022` / `0023` run automatically on startup (MCP tables + virtual `mcp:{serverId}:{toolName}` tool IDs)
- Rebuild/re-pull the Docker image if you use the browser tool in containers
- MCP URLs must be public `http`/`https` (private/local addresses are blocked)

[0.5.0]: https://github.com/phamvanquyit/raw-agents/compare/v0.4.2...v0.5.0

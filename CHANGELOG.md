# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2026-07-20

### Added
- Chat runs survive refresh (F5) — SSE replay resumes an in-progress stream instead of losing the reply
- Tool folders — organize custom tools into folders with a kanban-style Tools page
- Agent avatars — set a custom avatar per agent
- MCP sync status — track last sync time and last sync error on MCP servers
- Dedicated tool UIs in chat for browser and call-agent tool calls

### Changed
- UI redesign across app shell, agents, tools, settings, and chat (shadcn components, theme tokens)
- Agents list supports a tree/group view
- `call_agent` is no longer an assignable builtin; callable agents stay wired via agent config
- Removed builtin `fetch_webpage` (use the browser tool instead)
- Coding agent uses the browser tool when inspecting pages before writing code

### Upgrade notes
- SQLite migrations `0024`–`0029` run automatically on startup (remove deprecated tool assignments, MCP sync columns, tool folders, agent avatar)
- Agents that still referenced `builtin:fetch_webpage` or `builtin:call_agent` lose those assignments after migrate — reconfigure if needed
- Rebuild/re-pull the Docker image for the new UI and server changes

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

[0.6.0]: https://github.com/phamvanquyit/raw-agents/compare/v0.5.1...v0.6.0
[0.5.0]: https://github.com/phamvanquyit/raw-agents/compare/v0.4.2...v0.5.0

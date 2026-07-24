# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.12.0] - 2026-07-24

### Added
- Token usage tracking for agent runs, with Usage page and per-chat context meter
- Lazy tool schemas via `get_tool_schema` — bind full parameter schemas only after the model loads them

### Changed
- Agent chat loads the full conversation transcript (window truncation removed; compaction can come later)

### Fixed
- Lazy-loaded tools stay available across turns by hydrating schemas from conversation history
- Broader parsing of reasoning/thinking SSE content shapes so streaming UI does not drop thinking

### Upgrade notes
- SQLite migration `0034_token_usage.sql` runs automatically on startup
- Rebuild/re-pull the Docker image for the UI and server changes

## [0.11.0] - 2026-07-23

### Added
- Datatables — projects, tables, columns, and rows with REST API, WebSocket events, sidebar UI, and an agent `datatable` tool
- Timezone-aware datetime columns in the Datatables UI (app timezone + date-fns helpers)
- Open Graph / Twitter meta for shared public chat links (`/chat/:id`), including `og-image.png` and public agent title when available
- Python workspace runtime via `import rawagents` (`rawagents.kv`, `rawagents.secrets`, `rawagents.datatable`) generated into the tool sandbox

### Changed
- Agent flow canvas redesigned: branch/tool hub nodes and richer MCP/tools assignment controls (replaces group-node layout)
- Python tools no longer use injected `ctx.kv` / `ctx.secrets` — use `import rawagents` instead
- Multi-round chat streaming: per-step thinking/assistant segments, earlier optimistic tool-call paint, and activity elapsed status; SSE pings ignored in the UI

### Fixed
- Agent run cancel, stall watchdog, and timeouts for tools / MCP / browser / `call_agent`; early tool-call emission and SSE keep-alive pings so long runs stay cancelable and connected

### Upgrade notes
- SQLite migrations `0032_datatables.sql` and `0033_datatable_column_name.sql` run automatically on startup
- **Breaking (Python tools):** replace `ctx.kv` / `ctx.secrets` with `import rawagents` — e.g. `rawagents.kv.get("KEY")`, `rawagents.secrets.get("KEY")`, and `rawagents.datatable.*` for tables
- Rebuild/re-pull the Docker image for the UI and server changes

## [0.10.0] - 2026-07-22

### Added
- KV Store module for key-value storage with CRUD API and web UI
- Secrets module for encrypted secret management with AES-256-GCM
- Agent context (`ctx.kv`, `ctx.secrets`) in Python tool runner with lazy decryption proxy
- WebSocket JWT authentication via Sec-WebSocket-Protocol
- Storage section in sidebar with KV Store and Secrets navigation
- Role-based WebSocket broadcast filtering (secrets events are admin-only)

### Changed
- Sidebar redesigned with sliding panel for main ↔ settings navigation
- `listQuery` now supports optional limit (omit to return all rows)
- Slice filters default to loading all items when pagination params omitted
- Modal styling polished with Ant Design theme tokens

### Fixed
- Updated deprecated Ant Design props (`showSearch`, `bordered` → `variant`, `width` → `size`)

### Upgrade notes
- Migration `0031_kv_store_and_secrets.sql` adds `kvStore` and `secrets` tables
- WebSocket connections now require JWT authentication; guests on public chat routes are excluded
- Python tools can access workspace stores via `ctx.kv.get("KEY")` and `ctx.secrets.get("KEY")`

## [0.9.0] - 2026-07-21

### Added
- Guest public chat streams via fingerprint-gated SSE (`POST /api/public/agents/:id/conversations/:convId/chat`)
- Authenticated conversations are scoped to the owning user across list, feed, and chat APIs

### Changed
- Public chat UI redesigned (resizable sidebar, empty-state starters, shared shell styling)

### Fixed
- Chat auto-scroll stays pinned during streaming and layout/textarea resize

### Upgrade notes
- Multi-user installs: each user only sees their own non-public conversations
- Rebuild/re-pull the Docker image for the UI and server changes

## [0.8.0] - 2026-07-20

### Added
- Prompt assistant includes the agent's assigned tools and callable sub-agents when drafting system prompts
- Agents list redesigned as a team-section board with clearer empty states
- MCP Servers page uses a card grid layout

### Changed
- MCP tool labels show `server → tool` in assignments and chat
- Agent detail, chat, prompt, and flow UI polished (conversation list, empty state, shared header)
- App shell, chat controls, theme tokens, and provider icons refined

### Fixed
- Failed MCP sync deactivates the server and disconnects it instead of leaving a broken connection active

### Upgrade notes
- Rebuild/re-pull the Docker image for the UI and server changes

## [0.7.0] - 2026-07-20

### Added
- Tools kanban order is persisted — drag tools within a folder (or ungrouped) and the order survives reload
- `PUT /api/tools/reorder` and `tools:reordered` WebSocket event for syncing order across clients

### Changed
- Web UI migrated from shadcn/Radix to Ant Design (app shell, agents, tools, settings, chat, and dialogs)
- Coding agent omits older `generate_code` drafts from history to keep long edit sessions lighter

### Upgrade notes
- SQLite migration `0030` runs automatically on startup (`agent_tools.sort_order`)
- Rebuild/re-pull the Docker image for the new UI and server changes

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

[0.12.0]: https://github.com/phamvanquyit/raw-agents/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/phamvanquyit/raw-agents/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/phamvanquyit/raw-agents/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/phamvanquyit/raw-agents/compare/v0.8.2...v0.9.0
[0.8.0]: https://github.com/phamvanquyit/raw-agents/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/phamvanquyit/raw-agents/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/phamvanquyit/raw-agents/compare/v0.5.1...v0.6.0
[0.5.0]: https://github.com/phamvanquyit/raw-agents/compare/v0.4.2...v0.5.0

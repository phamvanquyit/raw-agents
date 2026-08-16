# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.23.1] - 2026-08-16

### Fixed
- Agent editor graph no longer mounts empty or loses nodes when opening an agent for the first time or switching agents

### Upgrade notes
- Rebuild or re-pull the Docker image

## [0.23.0] - 2026-08-16

### Added
- Chat shows running background tool tasks above the composer, with live logs and stop
- Detached Python tools stream `print()` into the task console; conversation APIs list, inspect, and cancel those tasks

### Changed
- Chat markdown, tables, and tool-call rows are restyled; generating status uses a shimmer instead of bouncing dots

### Upgrade notes
- Rebuild or re-pull the Docker image

## [0.22.1] - 2026-08-15

### Fixed
- Chat replies no longer drop the last few characters of a sentence when a tool call starts
- Vietnamese and other UTF-8 text stay intact through Python tools, datatables, KV, secrets, and site SSR

### Upgrade notes
- Rebuild or re-pull the Docker image

## [0.22.0] - 2026-08-15

### Added
- Settings → API Keys: issue keys scoped to selected agents (plaintext shown once; revoke or delete)
- External agent chat API: `GET /api/v1/agents`, `POST /api/v1/chat` (SSE or JSON), and `POST /api/v1/chat/stop` with a Bearer API key
- Assign datatable access per project on the agent flow (one locked tool per project)

### Changed
- All-projects builtin `datatable` is no longer listed in the tools catalog; existing assignments keep working until a project tool is enabled

### Fixed
- Agent flow and memory graph canvases fill the panel and drop the dotted background

### Upgrade notes
- Rebuild or re-pull the Docker image
- SQLite migration `0044_api_keys` applies on startup
- Agents still on `builtin:datatable` keep all-project access; enable a Datatables project in the flow to switch to per-project tools

## [0.21.0] - 2026-08-12

### Added
- Soft-wait for long-running custom Python tools, with `background_tasks` (list / get / await / cancel)
- Custom tool icons via Lucide SVG picker (tools list and chat tool calls)
- Skill assistant `delete_skill_file` to remove reference files
- Chat UI for `get_tool_schema` tool calls
- Richer frontend design guidance in the site coding agent prompt

### Changed
- Solar icons load via per-category imports; Vite chunking keeps heavy editors out of the shared vendor chunk
- Chat code blocks drop syntax highlighting (lighter dependency)

### Fixed
- Ant Design popover borders no longer tinted by CSS filter drop-shadow

### Upgrade notes
- Rebuild or re-pull the Docker image
- Existing tool `icon` values that are emoji or Solar name keys show the default until re-picked as SVG

## [0.20.2] - 2026-08-10

### Added
- Sites list as a filterable table with visibility icons (public / protected / unpublished)
- HttpOnly cookie for password-protected public site access (token no longer in the URL)

### Changed
- Legacy `?site_token=` / `?token=` public site URLs redirect to a clean path and set the cookie
- Site unlock flow keeps the access token out of the address bar and asset URLs

### Upgrade notes
- Rebuild or re-pull the Docker image
- Existing bookmarks with `?site_token=` still work via redirect; prefer sharing clean `/public/sites/<slug>` links after unlock

## [0.20.1] - 2026-08-10

### Added
- Agent Instruct tab for system prompt editing (full page; opens from the flow graph)
- Settings → Default models for workspace assistant panel defaults
- Site list thumbnails captured from the live editor preview and uploaded as PNG
- Deploy fingerprint (`buildId`) on `/api/health`; SPA reloads when a new build is detected

### Changed
- Agent Memory moved from the main tab bar into the agent header menu
- Memory graph uses a left sessions sidebar instead of a top branch strip
- Site thumbnails are no longer generated server-side with a headless browser

### Fixed
- Password-protected site unlock no longer redirect-loops after the password changes

### Upgrade notes
- Rebuild or re-pull the Docker image
- Optional Docker build arg `BUILD_ID` (e.g. git short SHA) for stable deploy fingerprints

## [0.20.0] - 2026-08-06

### Added
- Agent Memory tab: user knowledge graph (nodes/edges) with branch/session views
- Memory REST API under `/api/agents/:id/memory` and rebuilt `memory` LLM tool
- Conversation history compaction and memory budget for long chats
- Skill assistant `read_skill_file` tool to read working skill/reference content before edits
- Agent card shortcut to open public chat when the agent is public

### Changed
- Flat facts/notes memory replaced by an untyped node graph with free-form edge relations
- Skill agent workflow prefers `read_skill_file` + targeted `edit_skill_file` replaces

### Upgrade notes
- Rebuild or re-pull the Docker image
- SQLite migrations `0042_memory_phase1` / `0043_memory_graph` apply on startup (facts migrate to `memory_nodes`; `agent_notes` is dropped)
- Agents/tools still using `manage_memory` / note documents should switch to the `memory` graph tool

## [0.19.1] - 2026-08-05

### Fixed
- Chat model picker no longer reverts to the previous model after switching (provider + model saved in one update)

## [0.19.0] - 2026-08-04

### Added
- Skills catalog: create/edit skills with markdown body, references, and AI draft review
- Skill assistant agent (`edit_skill_file`) for drafting skill content in the editor
- Assign skills to agents from the agent flow graph (progressive disclosure via `read_skill`)
- Monaco markdown highlighting/theme tuned for skill editing

### Changed
- Agent flow edges use counted connectors; shared nodes restyled for tools/MCP/skills sections

### Upgrade notes
- Rebuild or re-pull the Docker image
- SQLite migrations `0040_skills` / `0041_skills_draft_content` apply on startup

## [0.18.0] - 2026-08-03

### Added
- Dedicated chat UIs for `get_current_time` and `manage_memory` tools
- Scrollbar thumb appears on hover (hidden by default)

### Changed
- Tool call bubbles and browser tool chrome simplified
- Tool labels include folder name when set (`Folder → Tool`)
- `manage_memory` is visible again in public chat

### Fixed
- Tool history stays OpenAI-compatible (assistant before tool groups; orphan tool rows rebuild on load)
- Reasoning-only replies promote thinking into visible assistant content

### Upgrade notes
- Rebuild or re-pull the Docker image

## [0.17.2] - 2026-08-03

### Fixed
- Chat stick-to-bottom during streaming: fewer accidental unpins from trackpad rubber-band or layout height changes

### Upgrade notes
- Rebuild or re-pull the Docker image

## [0.17.0] - 2026-08-02

### Added
- Datatable schema editor with streaming schema agent (table/column CRUD via tools)
- Tools page tree view by folder (replaces kanban board)
- App-wide NotFound page and AuthGuard via React Router Outlet
- Redux list caches for Jobs, Sites, and Datatable projects

### Changed
- Agent flow graph layout simplified (removed group-branch node)
- Removed token/context usage tracking: `/api/usage`, Settings Usage tab, and chat context meter

### Fixed
- Chat Mermaid fences while streaming and auto-scroll follow behavior

### Upgrade notes
- Rebuild or re-pull the Docker image
- Clients of `/api/usage` or the context-usage SSE events must drop those integrations

## [0.16.0] - 2026-07-31

### Added
- Builtin `fetch_url` tool: HTTP fetch with `md` / `html` / `raw` output for page and docs reads (prefer over `browser` when no interaction is needed)
- Coding agents (`tools` / `jobs`): `edit_code` with `mode=replace` (exact hunks) or `mode=full`, plus mid-step history compaction for edit payloads
- Site agent: per-surface edit tools (`edit_ui`, `edit_styles`, `edit_backend`, `edit_deps`) with the same replace/full edit model

### Changed
- Sites source layout: `data.ts` + `actions.ts` unified into `backend.ts` (`handle`); client always loads data via API (no `__RA_SITE_DATA__` inject)
- `generate_code` / `write_site_file` replaced by the edit tools above; editors apply drafts from tool results

### Upgrade notes
- Rebuild or re-pull the Docker image
- Existing sites migrate `data.ts`/`actions.ts` → `backend.ts` on access; re-check custom backends after upgrade

## [0.15.1] - 2026-07-31

### Added
- LLM provider API keys encrypted at rest; list/detail responses expose `hasApiKey` / `maskedApiKey` only
- Anthropic model list via the public `/v1/models` API
- Server-side compaction for site `write_site_file` history and coding `generate_code` payloads

### Changed
- Provider API keys are write-only: blank on update keeps the existing key; settings UI no longer shows or requires the full key to save
- Provider add catalog trimmed to OpenAI, OpenRouter, and Anthropic (existing Google / Ollama / custom rows still run)
- Assistant chat history: turn summaries are UI-only and excluded from the next model request; client no longer redacts large tool inputs
- Higher default agent `maxSteps` on the server; clients no longer send `maxSteps`

### Upgrade notes
- Rebuild or re-pull the Docker image
- Any client of `GET /api/providers` or `GET /api/providers/:id` must stop reading `apiKey` — use `hasApiKey` / `maskedApiKey` instead
- Existing plaintext provider keys keep working until rotated (then stored encrypted)

## [0.15.0] - 2026-07-30

### Changed
- Sites runtime is now Hono + React (client SPA): `app.tsx` / `data.ts` / `actions.ts` instead of Remix-shaped loader/route/action + `srcDoc` SSR
- Public sites are served as real HTML documents at `/public/sites/:slug` (plus `/assets/*`); draft preview uses `/api/sites/:id/live`
- Site agent prompt and scaffold updated for `loadSiteData` / `siteAction` client helpers
- Legacy Remix site trees migrate automatically to the React file set on first access

### Fixed
- Nested editor / flickering tab navigation caused by `srcDoc` iframe + relative URL resolution
- Chat streaming persists trailing thinking/text before `done` and keeps optimistic segments stable (less refetch race / remount flicker)
- Chat auto-scroll no longer locks follow when content height shrinks (e.g. thinking collapse)

### Upgrade notes
- Rebuild/re-pull the Docker image
- Existing sites auto-migrate source files on open; review `app.tsx` after migrate if the site used complex Remix forms (`RaForm`)
- Vite proxies `/public/sites` to the API in development

## [0.14.3] - 2026-07-30

### Added
- MCP Servers — create/edit/delete servers from a dialog on the list page (replaces the Cursor-format JSON config editor)
- Datatables project list returns `tableCount` so the UI no longer fans out per-project table fetches
- Separate Job and Site coding-assistant provider/model settings (no longer share the Tool assistant keys)
- ModelPicker caches provider model lists in Redux (`ensureLlmProviders` / `fetchProviderModels`)

### Changed
- Agent list API omits heavy/secret fields (`systemPrompt`, `publicPassword`, `callableAgentIds`); detail UI loads from `GET /api/agents/:id`
- Sidebar regroups Sites/Jobs under Capabilities and Datatables/KV/Secrets under Resources
- Removed Cursor-format bulk MCP config API (`GET`/`PUT /api/mcp-servers/config`) and the `/mcp-servers/edit` page

### Fixed
- Chat streaming commits thinking/text segments locally around tool rounds instead of mid-stream `/messages` refetches

### Upgrade notes
- Rebuild/re-pull the Docker image for the UI and API changes
- If anything still called `/api/mcp-servers/config`, switch to per-server CRUD (`POST`/`PUT`/`DELETE /api/mcp-servers`)

## [0.14.1] - 2026-07-29

### Added
- Optional `PUBLIC_BASE_URL` / `PUBLIC_URL` for absolute public site URLs behind a reverse proxy
- Root `docker-compose.yml` for Compose-based runs

### Changed
- Sites POST forms use platform `RaForm` and host intercept (preview/public soft-reload instead of navigating away)
- Site agent summarizes tool-only turns; check tool nudges bare `<form method="post">` toward `RaForm`

### Fixed
- Sites SSR worker timeout/kill and forced exit so hung loaders do not stall previews
- Per-site SSR lock wait timeout to avoid permanent preview queue stalls

### Upgrade notes
- Optional: set `PUBLIC_BASE_URL` when behind a reverse proxy
- Rebuild/re-pull the Docker image for the Sites form/SSR fixes

## [0.14.0] - 2026-07-28

### Added
- Jobs — admin UI for cron-scheduled Bun/TypeScript scripts with draft/publish, multi-cron schedules, and run history with live logs
- Jobs coding agent to generate and edit job scripts; scripts can discover and run workspace agents via `rawagents.agents`

### Fixed
- Sites SSR worker is bundled and resolved correctly in production Docker builds
- Remove redundant “New site” row on the Sites list (create stays in the page header)

### Upgrade notes
- SQLite migrations `0038_jobs.sql` and `0039_jobs_draft_code.sql` run automatically on startup
- Rebuild/re-pull the Docker image for Jobs UI/API and the Sites SSR worker fix

## [0.13.0] - 2026-07-27

### Added
- Sites — draft/publish JSX sites with AI editor, SSR preview, thumbnails, and optional public password
- Public site pages at `/public/sites/:slug` with password / access-token verification
- Refresh tokens for silent session renewal (login/setup return `refreshToken`; `/api/auth/refresh`)
- Live `context-usage` SSE estimates on prompt/coding (and related) agent streams

### Changed
- Access JWT lifetime shortened to 1 hour; clients renew via refresh token
- Sidebar “Storage” renamed to “Resources” and includes Sites

### Fixed
- Modal.confirm theme/padding when rendered outside the React tree

### Upgrade notes
- SQLite migrations `0035_sites.sql`, `0036_sites_public_password.sql`, and `0037_refresh_tokens.sql` run automatically on startup
- Web UI stores and rotates refresh tokens; API clients that only keep the access JWT must call `/api/auth/refresh` or re-login after ~1h
- Rebuild/re-pull the Docker image for the UI and server changes

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

[0.23.1]: https://github.com/phamvanquyit/raw-agents/compare/v0.23.0...v0.23.1
[0.23.0]: https://github.com/phamvanquyit/raw-agents/compare/v0.22.1...v0.23.0
[0.22.1]: https://github.com/phamvanquyit/raw-agents/compare/v0.22.0...v0.22.1
[0.22.0]: https://github.com/phamvanquyit/raw-agents/compare/v0.21.0...v0.22.0
[0.21.0]: https://github.com/phamvanquyit/raw-agents/compare/v0.20.2...v0.21.0
[0.20.2]: https://github.com/phamvanquyit/raw-agents/compare/v0.20.1...v0.20.2
[0.20.1]: https://github.com/phamvanquyit/raw-agents/compare/v0.20.0...v0.20.1
[0.20.0]: https://github.com/phamvanquyit/raw-agents/compare/v0.19.1...v0.20.0
[0.19.1]: https://github.com/phamvanquyit/raw-agents/compare/v0.19.0...v0.19.1
[0.19.0]: https://github.com/phamvanquyit/raw-agents/compare/v0.18.0...v0.19.0
[0.18.0]: https://github.com/phamvanquyit/raw-agents/compare/v0.17.2...v0.18.0
[0.17.2]: https://github.com/phamvanquyit/raw-agents/compare/v0.17.1...v0.17.2
[0.17.0]: https://github.com/phamvanquyit/raw-agents/compare/v0.16.0...v0.17.0
[0.16.0]: https://github.com/phamvanquyit/raw-agents/compare/v0.15.1...v0.16.0
[0.15.1]: https://github.com/phamvanquyit/raw-agents/compare/v0.15.0...v0.15.1
[0.15.0]: https://github.com/phamvanquyit/raw-agents/compare/v0.14.3...v0.15.0
[0.14.3]: https://github.com/phamvanquyit/raw-agents/compare/v0.14.2...v0.14.3

[0.14.1]: https://github.com/phamvanquyit/raw-agents/compare/v0.14.0...v0.14.1
[0.14.0]: https://github.com/phamvanquyit/raw-agents/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/phamvanquyit/raw-agents/compare/v0.12.1...v0.13.0
[0.12.0]: https://github.com/phamvanquyit/raw-agents/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/phamvanquyit/raw-agents/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/phamvanquyit/raw-agents/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/phamvanquyit/raw-agents/compare/v0.8.2...v0.9.0
[0.8.0]: https://github.com/phamvanquyit/raw-agents/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/phamvanquyit/raw-agents/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/phamvanquyit/raw-agents/compare/v0.5.1...v0.6.0
[0.5.0]: https://github.com/phamvanquyit/raw-agents/compare/v0.4.2...v0.5.0

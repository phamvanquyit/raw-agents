# Raw Agents

Self-hosted AI agents with a web UI — extend them with Python/JS tools & MCP, schedule them with cron Jobs, and publish them as public chats & Sites. One Docker container, SQLite, MIT.

![License](https://img.shields.io/badge/license-MIT-blue)
![Runtime](https://img.shields.io/badge/runtime-Bun-f472b6)
![Docker](https://img.shields.io/badge/docker-ready-2496ED)

## Features

- 🤖 **Multi-Agent Management** — Create and configure multiple AI agents with personas, tools, and avatars
- 🧠 **Multi-Provider** — OpenAI, Anthropic, Google Gemini, OpenRouter and more via LangChain
- 🛠️ **Custom Tools** — JavaScript / Python tools, organized in folders on a kanban-style Tools page
- 🔌 **MCP Servers** — Connect remote MCP servers (SSE / Streamable HTTP), sync catalogs, and attach tools to agents
- 🌐 **Browser Tool** — Builtin stealth headless browser for navigate, click, fill, snapshot, and screenshots
- 🔗 **Fetch URL** — Builtin HTTP fetch (`md` / `html` / `raw`) for page and docs reads without a full browser session
- 🗄️ **KV Store** — Key-value storage accessible from Python tools via `import rawagents` (`rawagents.kv`)
- 🔐 **Secrets Management** — Encrypted secret storage with AES-256-GCM (`rawagents.secrets`)
- 📊 **Datatables** — Workspace tables (projects → tables → rows) in the UI and via `rawagents.datatable`
- 📄 **Sites** — AI-assisted React sites (`app.tsx` / `backend.ts` / `styles.css`) with draft/publish, live HTML preview, and optional public password links
- 📈 **Usage** — Token usage history, summaries, and a per-chat context meter (system / tools / conversation)
- ⏰ **Jobs** — Cron-scheduled Bun/TypeScript scripts with admin UI, AI editor, and `rawagents.agents` to call workspace agents
- 💬 **Real-time Chat** — Live streaming chat with agents; refresh (F5) resumes an in-progress reply
- 🔗 **Public Sharing** — Share agents via public links with optional password protection; Open Graph previews for shared chat links

## Installation

### Option 1: Docker (Recommended)

The easiest way to run Raw Agents.

```bash
docker run -d \
  --name raw-agents \
  -p 15888:15888 \
  -v raw-agents-data:/data \
  phamvanquyit/raw-agents:latest
```

Open the web UI at [http://localhost:15888](http://localhost:15888).

#### Docker Compose

Create a `docker-compose.yml`:

```yaml
services:
  raw-agents:
    image: phamvanquyit/raw-agents:latest
    container_name: raw-agents
    ports:
      - "15888:15888"
    volumes:
      - raw-agents-data:/data
    restart: unless-stopped

volumes:
  raw-agents-data:
```

Then run:

```bash
docker compose up -d
```

#### Environment Variables

| Variable          | Default       | Description                                      |
| ----------------- | ------------- | ------------------------------------------------ |
| `PORT`            | `15888`       | Server port                                      |
| `HOST`            | `0.0.0.0`     | Server host                                      |
| `DATA_DIR`        | `/data`       | Data directory                                   |
| `PUBLIC_BASE_URL` | _(auto)_      | Public origin behind reverse proxy (e.g. `https://agents.example.com`). Falls back to browser origin / `X-Forwarded-*`. |

#### Build Docker Image Locally

```bash
docker build -t raw-agents:local .
docker run -d -p 15888:15888 -v raw-agents-data:/data raw-agents:local
```

---

### Option 2: Clone Source

#### Prerequisites

[Bun](https://bun.sh/) runtime ≥ 1.2 is required.

```bash
curl -fsSL https://bun.sh/install | bash
```

#### Setup

```bash
# Clone the repo
git clone https://github.com/phamvanquyit/raw-agents.git
cd raw-agents

# Install dependencies
bun install

# Start in development mode (API + Vite HMR)
bun run dev

# Or start in production mode
bun run build
bun run start
```

The web UI will be available at [http://localhost:15888](http://localhost:15888).

#### Available Scripts

| Script               | Description                         |
| -------------------- | ----------------------------------- |
| `bun run dev`        | Start dev servers (API + Vite HMR)  |
| `bun run build`      | Build for production                |
| `bun run start`      | Start production server             |
| `bun run lint`       | Run linter                          |
| `bun run lint:fix`   | Run linter with auto-fix            |
| `bun run format`     | Format code                         |
| `bun run biome:check`| Lint + format check                 |
| `bun run typecheck`  | TypeScript type checking            |

## Data Storage

All data is stored in the data directory (`/data` in Docker, `~/.raw-agents` by default when running from source):

```
<data-dir>/
├── data.db                 # SQLite database (agents, conversations, settings)
├── browser-screenshots/    # PNGs from the builtin browser tool
├── agent.pid               # PID file (daemon mode)
└── agent.log               # Server logs (daemon mode)
```

## Tech Stack

- **Runtime**: [Bun](https://bun.sh/)
- **Server**: [Hono](https://hono.dev/) — lightweight, fast HTTP framework
- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS + Ant Design
- **Database**: SQLite (`bun:sqlite`) + Drizzle ORM
- **AI**: LangChain (`@langchain/*`)
- **State**: Redux Toolkit

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

[MIT](LICENSE)

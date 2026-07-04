import { createApp } from "./app.js";
import { closeDb, getDb } from "./common/db/client.js";
import { wsHub } from "./common/ws/wsHub.js";
import { handleWsMessage } from "./modules/agents/chat.route.js";
import { seedBuiltinTools } from "./modules/tools/tools.service.js";

export interface ServerOptions {
  port?: number;
  host?: string;
  dataDir?: string;
}

// Map to track clientId per WebSocket connection
const wsClientIds = new Map<object, string>();

export async function startServer(options: ServerOptions = {}): Promise<void> {
  const port = options.port ?? Number(process.env.PORT ?? "15888");
  const host = options.host ?? process.env.HOST ?? "127.0.0.1";
  const dataDir = options.dataDir ?? process.env.DATA_DIR ?? `${process.env.HOME}/.raw-agents`;

  // Set DATA_DIR globally so routes can pick it up
  process.env.DATA_DIR = dataDir;

  // Initialize DB
  getDb(dataDir);

  // Seed builtin tools into DB (ensures FK for tool assignments)
  seedBuiltinTools();

  const app = createApp();

  const server = Bun.serve({
    fetch(req, server) {
      // Upgrade WebSocket connections at /ws
      if (new URL(req.url).pathname === "/ws") {
        const upgraded = server.upgrade(req);
        if (upgraded) return undefined;
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return app.fetch(req, server);
    },
    websocket: {
      open(ws) {
        const clientId = crypto.randomUUID();
        wsClientIds.set(ws, clientId);
        wsHub.add(ws, clientId);
        // Send clientId to FE so it can identify itself for targeted events
        ws.send(JSON.stringify({ type: "client:id", payload: { clientId } }));
      },
      close(ws) {
        const clientId = wsClientIds.get(ws);
        if (clientId) {
          wsHub.remove(clientId);
          wsClientIds.delete(ws);
        }
      },
      async message(ws, data) {
        const clientId = wsClientIds.get(ws) ?? "";
        try {
          const msg = JSON.parse(data as string) as {
            type: string;
            payload: unknown;
          };
          if (msg.type === "chat:send") {
            await handleWsMessage(
              clientId,
              msg.payload as {
                agentId: string;
                conversationId: string;
                message: string;
              },
            );
          }
          // ping: no-op
        } catch {
          // ignore malformed
        }
      },
    },
    port,
    hostname: host,
    idleTimeout: 120,
  });

  // Graceful shutdown
  const shutdown = () => {
    closeDb();
    server.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// ─── Direct run: bun src/index.ts ─────────────────────────────────────────────
if (import.meta.main) {
  startServer();
}

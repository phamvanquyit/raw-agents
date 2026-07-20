import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// ─── Agents ───────────────────────────────────────────────────────────────────

export const agents = sqliteTable("agents", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  /** react-nice-avatar JSON config (or image URL) */
  avatar: text("avatar"),
  systemPrompt: text("system_prompt"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(false),
  publicPassword: text("public_password"), // Mật khẩu cho link public (optional)
  // Per-agent AI config — aiProvider stores the UUID from llmProviders table
  aiProvider: text("ai_provider"),
  aiModel: text("ai_model"),

  /** JSON array of agent UUIDs this agent can delegate to (one call_agent__* tool each) */
  callableAgentIds: text("callable_agent_ids", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  /** Which team this agent belongs to (denormalized for simpler queries) */
  teamId: text("team_id").references(() => agentTeams.id, {
    onDelete: "set null",
  }),
  /** Which user created this agent */
  createdBy: text("created_by"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;

// ─── Per-User Facts ───────────────────────────────────────────────────────────
// Short facts (key-value style) per agent+user. Always injected into system prompt.

export const agentUserFacts = sqliteTable("agent_user_facts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  ownerId: text("owner_id").notNull().default("user"),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type AgentUserFact = typeof agentUserFacts.$inferSelect;
export type NewAgentUserFact = typeof agentUserFacts.$inferInsert;

// ─── Agent Notes (Documents) ─────────────────────────────────────────────────
// Long documents (markdown). Only titles injected into system prompt.
// Agent uses manage_memory(read_doc, id) to load full content on-demand.

export const agentNotes = sqliteTable("agent_notes", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  ownerId: text("owner_id").notNull().default("user"),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type AgentNote = typeof agentNotes.$inferSelect;
export type NewAgentNote = typeof agentNotes.$inferInsert;

// ─── Agent Teams ──────────────────────────────────────────────────────────────

export const agentTeams = sqliteTable("agent_teams", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type AgentTeam = typeof agentTeams.$inferSelect;
export type NewAgentTeam = typeof agentTeams.$inferInsert;

// ─── Conversations ───────────────────────────────────────────────────────────
// Mỗi conversation là 1 phiên chat: manual (user gõ tay) hoặc task (agent tự chạy)
export const agentConversations = sqliteTable("agent_conversations", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  agentId: text("agent_id").references(() => agents.id, {
    onDelete: "set null",
  }),
  ownerId: text("owner_id").notNull().default("user"),
  title: text("title").notNull(),
  trigger: text("trigger", { enum: ["manual", "cron", "api", "meeting", "public"] })
    .notNull()
    .default("manual"),
  status: text("status", { enum: ["running", "done", "failed"] })
    .notNull()
    .default("running"),
  errorMessage: text("error_message"),
  startedAt: integer("started_at", { mode: "timestamp" }),
  finishedAt: integer("finished_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type AgentConversation = typeof agentConversations.$inferSelect;
export type NewAgentConversation = typeof agentConversations.$inferInsert;

// ─── Messages ─────────────────────────────────────────────────────────────────
// Messages thuộc về một conversation cụ thể.

export const agentMessages = sqliteTable("agent_messages", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  /**
   * The agent this message is addressed TO (the AI agent being chatted with).
   */
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  /**
   * Conversation this message belongs to.
   * null → legacy orphan messages
   */
  conversationId: text("conversation_id").references(() => agentConversations.id, { onDelete: "cascade" }),
  /**
   * For agent-to-agent chat: the other agent's ID.
   * null → human / task
   */
  chatAgentId: text("chat_agent_id"),
  role: text("role", { enum: ["user", "assistant", "tool", "thinking"] })
    .notNull()
    .default("user"),
  content: text("content").notNull(),
  /** JSON metadata: { toolName, toolLabel, input, output, usage } */
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type AgentMessage = typeof agentMessages.$inferSelect;
export type NewAgentMessage = typeof agentMessages.$inferInsert;

// ─── MCP Servers ──────────────────────────────────────────────────────────────

/** Catalog entry synced from a remote MCP server (listTools). */
export type McpCatalogTool = {
  name: string;
  description: string;
  inputSchema: object;
};

export const mcpServers = sqliteTable("mcp_servers", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  url: text("url").notNull(),
  /** JSON object: custom headers for auth etc. */
  headers: text("headers", { mode: "json" }).$type<Record<string, string>>().notNull().default(sql`'{}'`),
  /** Synced MCP tool catalog — enable/disable is per-agent via assignments. */
  tools: text("tools", { mode: "json" }).$type<McpCatalogTool[]>().notNull().default(sql`'[]'`),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  /** Last sync failure message; null when the latest sync succeeded. */
  lastSyncError: text("last_sync_error"),
  /** Timestamp of the last sync attempt (success or failure). */
  lastSyncedAt: integer("last_synced_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type McpServer = typeof mcpServers.$inferSelect;
export type NewMcpServer = typeof mcpServers.$inferInsert;

// ─── Tool Folders ─────────────────────────────────────────────────────────────

export const toolFolders = sqliteTable("tool_folders", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type ToolFolder = typeof toolFolders.$inferSelect;
export type NewToolFolder = typeof toolFolders.$inferInsert;

// ─── Custom Tools ─────────────────────────────────────────────────────────────

export const agentTools = sqliteTable("agent_tools", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(), // snake_case identifier
  label: text("label").notNull(),
  description: text("description").notNull(),
  /** Emoji or icon key shown next to the tool name in the UI */
  icon: text("icon"),
  parameters: text("parameters", { mode: "json" }).$type<object>().notNull().default(sql`'{"type":"object","properties":{},"required":[]}'`),
  codeContent: text("code_content").notNull(),
  /** AI draft code — written by generate_code tool. null = no pending draft. */
  draftCode: text("draft_code"),
  /** Optional folder for grouping in the Tools UI */
  folderId: text("folder_id").references(() => toolFolders.id, {
    onDelete: "set null",
  }),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type AgentTool = typeof agentTools.$inferSelect;
export type NewAgentTool = typeof agentTools.$inferInsert;

// ─── Agent Tool Assignments (junction table) ──────────────────────────────────
// Maps agents ↔ tools with per-assignment metadata (parameters).
// tool_id FK cascade: deleting a tool auto-removes all its assignments.

export const agentToolAssignments = sqliteTable("agent_tool_assignments", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  toolId: text("tool_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type AgentToolAssignment = typeof agentToolAssignments.$inferSelect;
export type NewAgentToolAssignment = typeof agentToolAssignments.$inferInsert;

// ─── App Settings ─────────────────────────────────────────────────────────────

export const appSettings = sqliteTable("configurations", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type AppSetting = typeof appSettings.$inferSelect;

// ─── LLM Providers ─────────────────────────────────────────────────────────────

export const llmProviders = sqliteTable("llm_providers", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  provider: text("provider").notNull(), // "openai" | "openrouter" | "google" | ...
  label: text("label").notNull(), // human-readable name
  apiKey: text("api_key").notNull().default(""),
  customBaseUrl: text("custom_base_url").notNull().default(""),
  /** Cached list of model IDs from the provider's /models endpoint */
  models: text("models", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type LlmProvider = typeof llmProviders.$inferSelect;
export type NewLlmProvider = typeof llmProviders.$inferInsert;

// ─── Users ────────────────────────────────────────────────────────────────────
// User accounts for authentication and authorization.

export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  username: text("username").notNull().unique(),
  name: text("name").notNull().default(""),
  avatar: text("avatar"),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "member"] })
    .notNull()
    .default("member"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

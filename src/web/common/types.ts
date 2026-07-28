/**
 * FE-side type definitions — plain TypeScript, no Drizzle ORM.
 * These mirror the server DB schema and are used for typing API responses.
 */

// ─── Agents ───────────────────────────────────────────────────────────────────

export interface Agent {
  id: string;
  name: string;
  description: string | null;
  avatar: string | null;
  systemPrompt: string | null;
  callableAgentIds: string[];
  isActive: boolean;
  isPublic: boolean;
  publicPassword: string | null;
  cron: string | null;
  startMessage: string | null;
  runStatus: "idle" | "running" | "done" | "failed";
  aiProvider: string | null;
  aiModel: string | null;

  teamId: string | null;
  createdBy: string | null;
  creatorName: string | null;
  toolCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export type NewAgent = Partial<Agent> & { name: string };

// ─── Agent Notes ─────────────────────────────────────────────────────────────

export interface AgentNote {
  id: string;
  agentId: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export type NewAgentNote = Omit<AgentNote, "id" | "createdAt" | "updatedAt">;

// ─── Agent Teams ─────────────────────────────────────────────────────────────

export interface AgentTeam {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
}

export type NewAgentTeam = Omit<AgentTeam, "id" | "createdAt">;

export interface AgentTeamMember {
  id: string;
  teamId: string;
  agentId: string;
  role: "lead" | "member";
}

// ─── Conversations ────────────────────────────────────────────────────────────

export interface AgentConversation {
  id: string;
  agentId: string | null;
  teamId: string | null;
  ownerId: string;
  title: string;
  trigger: "manual" | "cron" | "api" | "meeting" | "public";
  status: "running" | "done" | "failed";
  errorMessage: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

export type NewAgentConversation = Omit<AgentConversation, "id" | "createdAt">;

// ─── Messages ─────────────────────────────────────────────────────────────────

export interface AgentMessage {
  id: string;
  agentId: string;
  conversationId: string | null;
  chatAgentId: string | null;
  role: "user" | "assistant" | "tool";
  content: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export type NewAgentMessage = Omit<AgentMessage, "id" | "createdAt">;

// ─── Tool Folders ─────────────────────────────────────────────────────────────

export interface ToolFolder {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
}

export type NewToolFolder = Omit<ToolFolder, "id" | "createdAt">;

// ─── Custom Tools ─────────────────────────────────────────────────────────────

export interface AgentTool {
  id: string;
  name: string;
  label: string;
  description: string;
  icon?: string;
  parameters: object;
  codeContent: string;
  draftCode?: string | null;
  folderId?: string | null;
  sortOrder?: number;
  isActive: boolean;
  createdAt: Date;
}

export type NewAgentTool = Omit<AgentTool, "id" | "createdAt">;

// ─── Agent Tool Assignments ─────────────────────────────────────────────────

export interface AgentToolAssignment {
  id: string;
  agentId: string;
  toolId: string;
  createdAt: Date;
  /** Joined from agent_tools */
  tool: {
    name: string;
    label: string;
    description: string;
  };
}

// ─── MCP Servers ──────────────────────────────────────────────────────────────

export interface McpServerTool {
  name: string;
  description: string;
  inputSchema: object;
}

export interface McpServer {
  id: string;
  name: string;
  url: string;
  headers: Record<string, string>;
  isActive: boolean;
  lastSyncError?: string | null;
  lastSyncedAt?: Date | string | null;
  toolCount?: number;
  tools?: McpServerTool[];
  createdAt: Date;
  updatedAt: Date;
}

export type NewMcpServer = Omit<McpServer, "id" | "createdAt" | "updatedAt" | "toolCount">;

// ─── App Settings ─────────────────────────────────────────────────────────────

export interface AppSetting {
  key: string;
  value: string;
  updatedAt: Date;
}

// ─── LLM Providers ────────────────────────────────────────────────────────────

export interface LlmProvider {
  id: string;
  provider: string;
  label: string;
  apiKey: string;
  customBaseUrl: string;
  models: string[];
  createdAt: Date;
  updatedAt: Date;
}

export type NewLlmProvider = Omit<LlmProvider, "id" | "createdAt" | "updatedAt">;

// ─── Agent Tasks ──────────────────────────────────────────────────────────────

export interface TaskSchedule {
  days: string[]; // ["MON","WED","FRI"] — empty = every day
  intervalMin: number; // repeat interval in minutes
  fromTime: string; // "HH:MM" start of active window
  toTime: string; // "HH:MM" end of active window
}

export interface AgentTask {
  id: string;
  agentId: string;
  type: "once" | "recurring";
  label: string;
  message: string;
  runAt: Date;
  cron: string | null;
  schedule?: TaskSchedule; // parsed from cron by backend
  status: "pending" | "running" | "done" | "failed";
  error: string | null;
  lastRunAt: Date | null;
  createdAt: Date;
}

export type NewAgentTask = Omit<AgentTask, "id" | "createdAt">;

// ─── Agent Task Runs ──────────────────────────────────────────────────────────

export type TaskRunMessage = {
  role: "user" | "assistant" | "tool";
  content: string;
};

export interface AgentTaskRun {
  id: string;
  taskId: string;
  agentId: string;
  taskLabel: string;
  triggerMessage: string;
  messagesJson: TaskRunMessage[];
  ranAt: Date;
  status: "done" | "failed";
  error: string | null;
}

export type NewAgentTaskRun = Omit<AgentTaskRun, "id">;

// ─── Custom Objects ───────────────────────────────────────────────────────────

export interface CustomObject {
  id: string;
  name: string;
  icon: string;
  category: string;
  thumbnail: string | null;
  designJson: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  username: string;
  name: string;
  avatar: string | null;
  role: "admin" | "member";
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type NewUser = Omit<User, "id" | "createdAt" | "updatedAt"> & {
  password: string;
};

// ─── KV Store ─────────────────────────────────────────────────────────────────

export interface KvStoreEntry {
  id: string;
  key: string;
  value: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Secrets ──────────────────────────────────────────────────────────────────

export interface SecretEntry {
  id: string;
  key: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Datatables ───────────────────────────────────────────────────────────────

export type DatatableColumnType = "text" | "number" | "boolean" | "datetime" | "select" | "json";

export interface DatatableProject {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DatatableTable {
  id: string;
  projectId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DatatableColumn {
  id: string;
  tableId: string;
  name: string;
  type: DatatableColumnType;
  options: string[] | null;
  required: boolean;
  sortOrder: number;
  createdAt: Date;
}

export interface DatatableRow {
  id: string;
  tableId: string;
  data: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Sites ────────────────────────────────────────────────────────────────────

export type SiteSourceFile = "loader.js" | "route.jsx" | "action.js" | "package.json";

export interface Site {
  id: string;
  name: string;
  slug: string;
  isPublished: boolean;
  hasPublicPassword?: boolean;
  depsStatus: string;
  depsError: string | null;
  draftDepsStatus: string;
  draftDepsError: string | null;
  draftUpdatedAt: Date | null;
  draftDirty?: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SiteFilesResponse {
  tree: "draft" | "prod";
  files: Record<SiteSourceFile, string>;
  draftDirty: boolean;
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export type JobRunStatus = "running" | "success" | "failed";
export type JobRunTrigger = "cron" | "manual";
export type JobLogLevel = "info" | "warn" | "error" | "system" | "step";
export type JobLogKind = "step" | "log" | "system" | "console";

export interface JobLogEntry {
  t: number;
  level: JobLogLevel;
  message: string;
  duration?: number;
  kind?: JobLogKind;
}

export interface Job {
  id: string;
  name: string;
  description: string | null;
  code: string;
  draftCode?: string | null;
  cron: string;
  enabled: boolean;
  timeoutMs: number;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  leaseOwner: string | null;
  leaseUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobRun {
  id: string;
  jobId: string;
  status: JobRunStatus;
  trigger: JobRunTrigger;
  logs: JobLogEntry[];
  error: string | null;
  instanceId: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

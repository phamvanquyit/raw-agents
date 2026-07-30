// ─── Agent Detail Page ────────────────────────────────────────────────────────
// Route: /agents/:id/* — Full-screen agent detail with Chat / Editor tabs.

import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import type { Agent, AgentListItem, AgentTool, AgentToolAssignment, McpServer } from "src/common/types";
import { fetchMcpServers } from "src/modules/mcp-servers/common/mcpServersSlice";
import { fetchTeams } from "src/modules/teams/common/teamsSlice";
import { fetchToolFolders } from "src/modules/tools/common/toolFoldersSlice";
import { fetchTools } from "src/modules/tools/common/toolsSlice";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { deleteAgent, fetchAgents, fetchOneAgent, updateAgent, upsertAgentLocal } from "../common/agentsSlice";
import { ChatPage } from "./chat/ChatPage";
import { type AgentDetailContext, AgentDetailCtx } from "./common/agentDetailContext";
import { AgentDetailHeader } from "./components/AgentDetailHeader";
import { AgentFlowView } from "./flow/AgentFlowView";

// ─── API helpers ───────────────────────────────────────────────────────────────

const API_BASE = "/api";

async function fetchAssignments(agentId: string): Promise<AgentToolAssignment[]> {
  const res = await fetch(`${API_BASE}/agents/${agentId}/tool-assignments`);
  return res.json();
}

async function apiRemoveAssignment(agentId: string, assignmentId: string): Promise<void> {
  await fetch(`${API_BASE}/agents/${agentId}/tool-assignments/${assignmentId}`, { method: "DELETE" });
}

async function apiAddAssignment(agentId: string, toolId: string): Promise<AgentToolAssignment> {
  const res = await fetch(`${API_BASE}/agents/${agentId}/tool-assignments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toolId }),
  });
  return res.json();
}

async function apiSetAssignments(agentId: string, toolIds: string[]): Promise<AgentToolAssignment[]> {
  const res = await fetch(`${API_BASE}/agents/${agentId}/tool-assignments`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: toolIds.map((toolId) => ({ toolId })) }),
  });
  return res.json();
}

async function apiUpdateCallableAgents(agentId: string, callableAgentIds: string[]): Promise<void> {
  await fetch(`${API_BASE}/agents/${agentId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callableAgentIds }),
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const isEditor = /\/editor\/?$/.test(location.pathname);
  const agents = useAppSelector((s) => s.agents.items) as AgentListItem[];
  const allTools = useAppSelector((s) => s.tools.items) as AgentTool[];
  const mcpServers = useAppSelector((s) => s.mcpServers.items) as McpServer[];
  const teams = useAppSelector((s) => s.teams.teams);
  const toolFolders = useAppSelector((s) => s.toolFolders.folders);

  // ── Detail form state (hydrated only from GET /:id — never from list cache) ──
  const [agent, setAgent] = useState<Agent | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [toolAssignments, setToolAssignments] = useState<AgentToolAssignment[]>([]);
  const toolAssignmentsRef = useRef(toolAssignments);
  toolAssignmentsRef.current = toolAssignments;
  const [callableAgentIds, setCallableAgentIds] = useState<string[]>([]);
  const callableAgentIdsRef = useRef(callableAgentIds);
  callableAgentIdsRef.current = callableAgentIds;
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [aiModel, setAiModel] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [publicPassword, setPublicPassword] = useState("");

  // Detail GET is the source of truth for the open agent
  useEffect(() => {
    if (!id) return;
    setAgent(null);
    dispatch(fetchOneAgent(id))
      .unwrap()
      .then((ag: Agent) => {
        setAgent(ag);
        dispatch(upsertAgentLocal(ag));
        setName(ag.name);
        setDescription(ag.description ?? "");
        setAvatar(ag.avatar ?? null);
        setTeamId(ag.teamId ?? null);
        setSystemPrompt(ag.systemPrompt ?? "");
        setAiModel(ag.aiModel ?? "");
        setIsPublic(ag.isPublic ?? false);
        setPublicPassword(ag.publicPassword ?? "");
        setCallableAgentIds(ag.callableAgentIds ?? []);
        if (ag.aiProvider) setSelectedProviderId(ag.aiProvider);
      })
      .catch(() => {});
  }, [id, dispatch]);

  // Editor-only catalog + assignments (list endpoints — not the open agent)
  useEffect(() => {
    if (!id || !isEditor) return;
    dispatch(fetchAgents());
    fetchAssignments(id).then(setToolAssignments);
    dispatch(fetchTools());
    dispatch(fetchToolFolders());
    dispatch(fetchMcpServers());
    dispatch(fetchTeams());
  }, [id, isEditor, dispatch]);

  // WS / mutations may upsert a full agent into the list store — merge into detail state
  useEffect(() => {
    if (!id) return;
    const fromStore = agents.find((a) => a.id === id) as Partial<Agent> | undefined;
    if (!fromStore || !Object.prototype.hasOwnProperty.call(fromStore, "systemPrompt")) return;
    setAgent((prev) => {
      if (!prev) return prev;
      if (fromStore.systemPrompt === prev.systemPrompt && fromStore.updatedAt === prev.updatedAt) return prev;
      return { ...prev, ...fromStore } as Agent;
    });
  }, [agents, id]);

  const handleProviderChange = useCallback((pid: string | null) => setSelectedProviderId(pid), []);

  const handleDelete = async () => {
    if (!id) return;
    await dispatch(deleteAgent(id));
    navigate("/agents");
  };

  // ── Flow interaction handlers ──────────────────────────────────────────────

  const handleRemoveToolAssignment = useCallback(
    (toolId: string) => {
      if (!id) return;
      const assignment = toolAssignmentsRef.current.find((a) => a.toolId === toolId);
      if (!assignment) return;
      setToolAssignments((prev) => prev.filter((a) => a.toolId !== toolId));
      apiRemoveAssignment(id, assignment.id).catch(() => {
        fetchAssignments(id).then(setToolAssignments);
      });
    },
    [id],
  );

  const handleAddToolAssignment = useCallback(
    (toolId: string) => {
      if (!id) return;
      apiAddAssignment(id, toolId).then((newAssignment) => {
        setToolAssignments((prev) => [...prev, newAssignment]);
      });
    },
    [id],
  );

  const handleToggleMcpTools = useCallback(
    (toolIds: string[], enable: boolean) => {
      if (!id || toolIds.length === 0) return;
      const target = new Set(toolIds);
      const prev = toolAssignmentsRef.current;
      const nextIds = enable ? [...new Set([...prev.map((a) => a.toolId), ...toolIds])] : prev.filter((a) => !target.has(a.toolId)).map((a) => a.toolId);

      const optimistic: AgentToolAssignment[] = nextIds.map((toolId) => {
        const existing = prev.find((a) => a.toolId === toolId);
        if (existing) return existing;
        return {
          id: `temp-${toolId}`,
          agentId: id,
          toolId,
          createdAt: new Date(),
          tool: { name: toolId, label: toolId, description: "" },
        };
      });
      setToolAssignments(optimistic);

      apiSetAssignments(id, nextIds)
        .then(setToolAssignments)
        .catch(() => {
          fetchAssignments(id).then(setToolAssignments);
        });
    },
    [id],
  );

  const handleToggleCallableAgent = useCallback(
    (agentId: string, enable: boolean) => {
      if (!id) return;
      const prev = callableAgentIdsRef.current;
      const next = enable ? (prev.includes(agentId) ? prev : [...prev, agentId]) : prev.filter((cid) => cid !== agentId);
      if (next.length === prev.length && next.every((v, i) => v === prev[i])) return;
      setCallableAgentIds(next);
      apiUpdateCallableAgents(id, next).catch(() => {
        if (callableAgentIdsRef.current === next) setCallableAgentIds(prev);
      });
    },
    [id],
  );

  const handleToggleCallableAgents = useCallback(
    (agentIds: string[], enable: boolean) => {
      if (!id || agentIds.length === 0) return;
      const prev = callableAgentIdsRef.current;
      const target = new Set(agentIds);
      const next = enable ? [...new Set([...prev, ...agentIds])] : prev.filter((cid) => !target.has(cid));
      if (next.length === prev.length && next.every((v, i) => v === prev[i])) return;
      setCallableAgentIds(next);
      apiUpdateCallableAgents(id, next).catch(() => {
        if (callableAgentIdsRef.current === next) setCallableAgentIds(prev);
      });
    },
    [id],
  );

  // ── Flow config handlers (model + name/desc — auto-save) ───────────────

  const handleFlowModelChange = useCallback(
    (providerId: string, model: string) => {
      handleProviderChange(providerId);
      setAiModel(model);
      if (id) dispatch(updateAgent({ id, aiProvider: providerId, aiModel: model }));
    },
    [id, dispatch, handleProviderChange],
  );

  const handleFlowNameChange = useCallback(
    (newName: string) => {
      setName(newName);
      if (id && newName.trim()) dispatch(updateAgent({ id, name: newName.trim() }));
    },
    [id, dispatch],
  );

  const handleFlowDescriptionChange = useCallback(
    (newDesc: string) => {
      setDescription(newDesc);
      if (id) dispatch(updateAgent({ id, description: newDesc.trim() || undefined }));
    },
    [id, dispatch],
  );

  const handleFlowAvatarChange = useCallback(
    async (newAvatar: string) => {
      setAvatar(newAvatar);
      if (id) await dispatch(updateAgent({ id, avatar: newAvatar })).unwrap();
    },
    [id, dispatch],
  );

  const handleTogglePublish = useCallback(
    (checked: boolean) => {
      setIsPublic(checked);
      if (id) dispatch(updateAgent({ id, isPublic: checked }));
    },
    [id, dispatch],
  );

  const handleSavePassword = useCallback(
    async (password: string) => {
      if (!id) return;
      setPublicPassword(password);
      await dispatch(updateAgent({ id, publicPassword: password }));
    },
    [id, dispatch],
  );

  // Loading / not found states
  if (!id) {
    return <Navigate to="/agents" replace />;
  }

  if (!agent) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-sm text-muted-foreground">Loading agent…</div>
      </div>
    );
  }

  // ── Context ────────────────────────────────────────────────────────────────

  const ctxValue: AgentDetailContext = {
    id,
    agent,
    name,
    setName,
    description,
    setDescription,
    teamId,
    setTeamId,
    selectedProviderId,
    onProviderChange: handleProviderChange,
    aiModel,
    setAiModel,
    systemPrompt,
    setSystemPrompt,
    isPublic,
    setIsPublic,
    publicPassword,
    setPublicPassword,
    toolAssignments,
    setToolAssignments,
    callableAgentIds,
    setCallableAgentIds,
    allTools,
    agents,
    onDelete: handleDelete,
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AgentDetailCtx.Provider value={ctxValue}>
      <div className="flex flex-col h-screen overflow-hidden">
        <AgentDetailHeader id={id} agent={agent} avatar={avatar} onDelete={handleDelete} />

        <div className="flex flex-1 min-h-0 overflow-hidden bg-card">
          <Routes>
            <Route index element={<ChatPage />} />
            <Route path="chat" element={<Navigate to={`/agents/${id}`} replace />} />
            <Route
              path="editor"
              element={
                <AgentFlowView
                  agent={agent}
                  agents={agents}
                  teams={teams}
                  toolFolders={toolFolders}
                  allTools={allTools}
                  mcpServers={mcpServers}
                  toolAssignments={toolAssignments}
                  callableAgentIds={callableAgentIds}
                  onRemoveToolAssignment={handleRemoveToolAssignment}
                  onAddToolAssignment={handleAddToolAssignment}
                  onToggleMcpTools={handleToggleMcpTools}
                  onToggleCallableAgent={handleToggleCallableAgent}
                  onToggleCallableAgents={handleToggleCallableAgents}
                  selectedProviderId={selectedProviderId}
                  aiModel={aiModel}
                  systemPrompt={systemPrompt}
                  name={name}
                  description={description}
                  avatar={avatar}
                  onModelChange={handleFlowModelChange}
                  onNameChange={handleFlowNameChange}
                  onDescriptionChange={handleFlowDescriptionChange}
                  onAvatarChange={handleFlowAvatarChange}
                  isPublic={isPublic}
                  onTogglePublish={handleTogglePublish}
                  publicPassword={publicPassword}
                  onSavePassword={handleSavePassword}
                />
              }
            />
          </Routes>
        </div>
      </div>
    </AgentDetailCtx.Provider>
  );
}

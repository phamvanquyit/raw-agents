// ─── Agent Detail Page ────────────────────────────────────────────────────────
// Route: /agents/:id/* — Full-screen agent detail with header + React Flow canvas.
// Shows current agent at center, callable agents above, tools on left.

import { AltArrowLeft, MenuDots, TrashBinTrash } from "@solar-icons/react";
import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import type { Agent, AgentTool, AgentToolAssignment } from "src/common/types";
import { AppLogo } from "src/components/AppLogo";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "src/components/ui/alert-dialog";
import { Button } from "src/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "src/components/ui/popover";
import { fetchLlmProviders } from "src/modules/llm-providers/common/llmProvidersSlice";
import { fetchTools } from "src/modules/tools/common/toolsSlice";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { deleteAgent, fetchAgents, fetchOneAgent, updateAgent } from "../common/agentsSlice";
import { ChatPage } from "./chat/ChatPage";
import { type AgentDetailContext, AgentDetailCtx } from "./common/agentDetailContext";

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
  const dispatch = useAppDispatch();
  const agents = useAppSelector((s) => s.agents.items) as Agent[];
  const allTools = useAppSelector((s) => s.tools.items) as AgentTool[];

  // ── Detail form state ──────────────────────────────────────────────────────
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [teamId, setTeamId] = useState<string | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [toolAssignments, setToolAssignments] = useState<AgentToolAssignment[]>([]);
  const [callableAgentIds, setCallableAgentIds] = useState<string[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [aiModel, setAiModel] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [publicPassword, setPublicPassword] = useState("");

  // Reset on agent change
  useEffect(() => {
    setLoaded(false);
  }, [id]);

  // Fetch agent + assignments
  useEffect(() => {
    if (!id) return;
    dispatch(fetchOneAgent(id));
    dispatch(fetchAgents());
    fetchAssignments(id).then((a) => setToolAssignments(a));
  }, [id, dispatch]);

  // Fetch tools + providers
  useEffect(() => {
    dispatch(fetchTools());
    dispatch(fetchLlmProviders());
  }, [dispatch]);

  // Hydrate form state from store
  useEffect(() => {
    if (loaded || !id) return;
    const ag = agents.find((a) => a.id === id);
    if (!ag) return;

    setName(ag.name);
    setDescription(ag.description ?? "");
    setTeamId((ag as typeof ag & { teamId?: string | null }).teamId ?? null);
    setSystemPrompt(ag.systemPrompt ?? "");
    setAiModel(ag.aiModel ?? "");
    setIsPublic(ag.isPublic ?? false);
    setPublicPassword(ag.publicPassword ?? "");
    setCallableAgentIds(ag.callableAgentIds ?? []);
    if (ag.aiProvider) setSelectedProviderId(ag.aiProvider);
    setLoaded(true);
  }, [agents, id, loaded]);

  const handleProviderChange = useCallback((pid: string | null) => setSelectedProviderId(pid), []);

  const handleBack = useCallback(() => {
    navigate("/agents");
  }, [navigate]);

  const handleDelete = async () => {
    if (!id) return;
    await dispatch(deleteAgent(id));
    navigate("/agents");
  };

  // ── Flow interaction handlers ──────────────────────────────────────────────

  const handleRemoveToolAssignment = useCallback(
    (toolId: string) => {
      if (!id) return;
      const assignment = toolAssignments.find((a) => a.toolId === toolId);
      if (!assignment) return;
      setToolAssignments(toolAssignments.filter((a) => a.toolId !== toolId));
      apiRemoveAssignment(id, assignment.id).catch(() => {
        fetchAssignments(id).then((a) => setToolAssignments(a));
      });
    },
    [id, toolAssignments],
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

  const handleAddCallableAgent = useCallback(
    (agentId: string) => {
      if (!id) return;
      const next = [...callableAgentIds, agentId];
      setCallableAgentIds(next);
      apiUpdateCallableAgents(id, next).catch(() => {
        setCallableAgentIds(callableAgentIds);
      });
    },
    [id, callableAgentIds],
  );

  const handleRemoveCallableAgent = useCallback(
    (agentId: string) => {
      if (!id) return;
      const next = callableAgentIds.filter((cid) => cid !== agentId);
      setCallableAgentIds(next);
      apiUpdateCallableAgents(id, next).catch(() => {
        setCallableAgentIds(callableAgentIds);
      });
    },
    [id, callableAgentIds],
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

  // Find current agent from store
  const agent = agents.find((a) => a.id === id);

  // Loading / not found states
  if (!id) {
    return <Navigate to="/agents" replace />;
  }

  if (!agent) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-sm text-muted">Loading agent…</div>
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
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-5 h-[52px] bg-surface border-b border-border shrink-0">
          <button
            type="button"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border bg-transparent text-soft text-sm font-medium cursor-pointer transition-all duration-150 font-[inherit] hover:bg-surface-raised hover:text-main hover:border-border-hover"
            onClick={handleBack}
          >
            <AltArrowLeft size={14} />
            <span>Back</span>
          </button>

          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <AppLogo size={22} fill="#a8ff53" strokeWidth={1} />
            <span className="text-base font-bold text-primary whitespace-nowrap overflow-hidden text-ellipsis">{agent.name}</span>
          </div>

          <div className="flex items-center gap-0.5">
            {/* ── Kebab menu ── */}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex items-center justify-center w-7 h-7 rounded-md border border-transparent bg-transparent text-muted cursor-pointer transition-all duration-150 hover:bg-surface-raised hover:text-main hover:border-border"
                >
                  <MenuDots width={15} height={15} />
                </button>
              </PopoverTrigger>
              <PopoverContent side="bottom" align="end" className="w-[180px] p-1">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-left text-xs font-medium text-danger cursor-pointer transition-colors duration-100 bg-transparent border-none font-[inherit] hover:bg-danger/10"
                    >
                      <TrashBinTrash width={13} height={13} />
                      <span>Delete Agent</span>
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <div className="flex flex-col gap-2.5">
                      <AlertDialogTitle>Delete "{agent.name}"?</AlertDialogTitle>
                      <AlertDialogDescription>This action cannot be undone. All conversations and tasks will be lost.</AlertDialogDescription>
                      <div className="flex flex-row justify-end gap-2">
                        <AlertDialogCancel asChild>
                          <Button size="sm" variant="secondary">
                            Cancel
                          </Button>
                        </AlertDialogCancel>
                        <AlertDialogAction asChild>
                          <Button size="sm" variant="danger" onClick={handleDelete}>
                            Delete
                          </Button>
                        </AlertDialogAction>
                      </div>
                    </div>
                  </AlertDialogContent>
                </AlertDialog>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* ── Content ────────────────────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <Routes>
            <Route
              index
              element={
                <AgentFlowView
                  agent={agent}
                  agents={agents}
                  allTools={allTools}
                  toolAssignments={toolAssignments}
                  callableAgentIds={callableAgentIds}
                  onRemoveToolAssignment={handleRemoveToolAssignment}
                  onAddToolAssignment={handleAddToolAssignment}
                  onAddCallableAgent={handleAddCallableAgent}
                  onRemoveCallableAgent={handleRemoveCallableAgent}
                  selectedProviderId={selectedProviderId}
                  aiModel={aiModel}
                  systemPrompt={systemPrompt}
                  name={name}
                  description={description}
                  onModelChange={handleFlowModelChange}
                  onNameChange={handleFlowNameChange}
                  onDescriptionChange={handleFlowDescriptionChange}
                  isPublic={isPublic}
                  onTogglePublish={handleTogglePublish}
                  publicPassword={publicPassword}
                  onSavePassword={handleSavePassword}
                />
              }
            />
            <Route path="chat" element={<ChatPage />} />
          </Routes>
        </div>
      </div>
    </AgentDetailCtx.Provider>
  );
}

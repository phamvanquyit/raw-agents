// ─── Agent Flow View ──────────────────────────────────────────────────────────
// React Flow canvas with current agent at center. To the right:
//   • Tools group (dashed box) — individual tool nodes, drag-connect to assign
//   • Call Agent group (dashed box, below tools) — individual agent nodes, drag-connect
// Each group has a dashed-border backdrop for visual grouping.

import { Background, BackgroundVariant, type Connection, type Edge, type Node, ReactFlow, ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Agent, AgentTool, AgentToolAssignment } from "src/common/types";
import { SimpleDialog } from "src/components/ui/dialog";
import { ChatPage } from "../chat/ChatPage";
import { PromptPage } from "../prompt/PromptPage";
import { DeletableEdge } from "./edges/DeletableEdge";
import { AgentConfigNode, type AgentConfigNodeType } from "./nodes/AgentConfigNode";
import { CallableAgentNode, type CallableAgentNodeType } from "./nodes/CallableAgentNode";
import { ChatNode, type ChatNodeType } from "./nodes/ChatNode";
import { DashedGroupNode, type DashedGroupNodeType } from "./nodes/DashedGroupNode";
import { FlowToolNode, type FlowToolNodeType } from "./nodes/FlowToolNode";
import { PublishNode, type PublishNodeType } from "./nodes/PublishNode";

// ─── Node & Edge Types ──────────────────────────────────────────────────────

const nodeTypes = {
  flowTool: FlowToolNode,
  callableAgent: CallableAgentNode,
  dashedGroup: DashedGroupNode,
  agentConfig: AgentConfigNode,
  chat: ChatNode,
  publish: PublishNode,
};

const edgeTypes = {
  deletable: DeletableEdge,
};

// ─── Layout Constants ────────────────────────────────────────────────────────

const CENTER_X = 500;
const CENTER_Y = 400;

const ITEMS_COL_X = CENTER_X + 600; // x position for items inside groups
const ITEM_GAP_Y = 50; // vertical spacing between nodes

const GROUP_PADDING_X = 16; // horizontal padding inside group box
const GROUP_PADDING_TOP = 32; // space for group label
const GROUP_PADDING_BOTTOM = 12;
const GROUP_GAP = 40; // gap between tools and agents groups

// ─── Edge Colors ─────────────────────────────────────────────────────────────

const TOOL_EDGE_COLOR = "#a8ff53";
const AGENT_EDGE_COLOR = "#9c9af2";
const PUBLISH_EDGE_COLOR = "#9c9af2";

// ─── Canvas Text Measurement ─────────────────────────────────────────────────

function measureMaxTextWidth(texts: string[], font = "600 12px Inter, system-ui, sans-serif"): number {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return 80;
  ctx.font = font;
  return texts.reduce((max, text) => Math.max(max, ctx.measureText(text).width), 0);
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface AgentFlowViewProps {
  agent: Agent;
  agents: Agent[];
  allTools: AgentTool[];
  toolAssignments: AgentToolAssignment[];
  callableAgentIds: string[];
  onRemoveToolAssignment: (toolId: string) => void;
  onAddToolAssignment: (toolId: string) => void;
  onAddCallableAgent: (agentId: string) => void;
  onRemoveCallableAgent: (agentId: string) => void;
  // Config node props
  selectedProviderId: string | null;
  aiModel: string;
  systemPrompt: string;
  name: string;
  description: string;
  onModelChange: (providerId: string, model: string) => void;
  onNameChange: (name: string) => void;
  onDescriptionChange: (desc: string) => void;
  // Publish
  isPublic: boolean;
  onTogglePublish: (checked: boolean) => void;
  publicPassword: string;
  onSavePassword: (password: string) => Promise<void>;
}

// ─── Inner Component ─────────────────────────────────────────────────────────

function AgentFlowInner({
  agent,
  agents,
  allTools,
  toolAssignments,
  callableAgentIds,
  onRemoveToolAssignment,
  onAddToolAssignment,
  onAddCallableAgent,
  onRemoveCallableAgent,
  selectedProviderId,
  aiModel,
  systemPrompt,
  name,
  description,
  onModelChange,
  onNameChange,
  onDescriptionChange,
  isPublic,
  onTogglePublish,
  publicPassword,
  onSavePassword,
}: AgentFlowViewProps) {
  const assignedToolIds = useMemo(() => new Set(toolAssignments.map((a) => a.toolId)), [toolAssignments]);
  const callableSet = useMemo(() => new Set(callableAgentIds), [callableAgentIds]);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [chatModalOpen, setChatModalOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Auto-open chat modal when URL has ?conv= (e.g. after F5 refresh)
  useEffect(() => {
    if (searchParams.has("conv")) {
      setChatModalOpen(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- only on mount

  // ─── Build Nodes ────────────────────────────────────────────────────────────

  const nodes = useMemo(() => {
    const result: Node[] = [];

    // ── Prepare data ────────────────────────────────────────────────────────

    const sortedTools = [...allTools]
      .filter((t) => t.isActive !== false && t.name !== "call_agent")
      .sort((a, b) => {
        const aBuiltin = a.id.startsWith("builtin:");
        const bBuiltin = b.id.startsWith("builtin:");
        if (aBuiltin !== bBuiltin) return aBuiltin ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    const otherAgents = agents.filter((a) => a.id !== agent.id).sort((a, b) => a.name.localeCompare(b.name));

    // ── Measure widths ──────────────────────────────────────────────────────

    const ITEM_FIXED_WIDTH = 56; // px-3 (24) + icon (24) + gap (8)
    const toolMaxText = measureMaxTextWidth(sortedTools.map((t) => t.label || t.name));
    const toolNodeWidth = Math.ceil(toolMaxText + ITEM_FIXED_WIDTH);

    const agentMaxText = measureMaxTextWidth(otherAgents.map((a) => a.name));
    const agentNodeWidth = Math.ceil(agentMaxText + ITEM_FIXED_WIDTH);

    const groupInnerWidth = Math.max(toolNodeWidth, agentNodeWidth);

    // ── Calculate group dimensions ──────────────────────────────────────────

    const toolsGroupHeight = GROUP_PADDING_TOP + sortedTools.length * ITEM_GAP_Y + GROUP_PADDING_BOTTOM;
    const agentsGroupHeight = GROUP_PADDING_TOP + otherAgents.length * ITEM_GAP_Y + GROUP_PADDING_BOTTOM;
    const groupWidth = groupInnerWidth + 2 * GROUP_PADDING_X;

    // Position tools group — vertically centered with current agent
    const totalHeight = toolsGroupHeight + GROUP_GAP + agentsGroupHeight;
    const toolsGroupY = CENTER_Y - totalHeight / 2 + 20;
    const agentsGroupY = toolsGroupY + toolsGroupHeight + GROUP_GAP;

    // ── 0. Config Node (central node) ──────────────────────────────────────

    const configNode: AgentConfigNodeType = {
      id: "config",
      type: "agentConfig",
      position: { x: CENTER_X - 190, y: CENTER_Y - 40 },
      style: { width: 380, height: 500 },
      data: {
        name,
        description,
        selectedProviderId,
        aiModel,
        systemPrompt,
        onNameChange,
        onDescriptionChange,
        onModelChange,
        onOpenPrompt: () => setPromptModalOpen(true),
        isPublic,
        onTogglePublish,
      },
    };
    result.push(configNode);

    // ── 0b. Chat Node (left of config) ────────────────────────────────────

    const chatNode: ChatNodeType = {
      id: "chat",
      type: "chat",
      position: { x: CENTER_X - 190 - 220, y: CENTER_Y + 140 },
      draggable: true,
      data: {
        onOpenChat: () => setChatModalOpen(true),
      },
    };
    result.push(chatNode);

    // ── 0c. Publish Node (below-left of config, visible when public) ────

    if (isPublic) {
      const publishNode: PublishNodeType = {
        id: "publish",
        type: "publish",
        position: { x: CENTER_X - 190 - 220, y: CENTER_Y + 390 },
        draggable: true,
        data: {
          isPublic,
          agentId: agent.id,
          publicPassword,
          onSavePassword,
        },
      };
      result.push(publishNode);
    }

    // ── 2. Tools Group Backdrop (dashed box) ────────────────────────────────

    const toolsBackdrop: DashedGroupNodeType = {
      id: "tools-backdrop",
      type: "dashedGroup",
      position: { x: ITEMS_COL_X - GROUP_PADDING_X, y: toolsGroupY },
      zIndex: -1,
      selectable: false,
      draggable: false,
      data: { label: "Tools", color: "#a8ff53", width: groupWidth, height: toolsGroupHeight },
    };
    result.push(toolsBackdrop);

    // ── 3. Individual Tool Nodes ────────────────────────────────────────────

    sortedTools.forEach((tool, i) => {
      const node: FlowToolNodeType = {
        id: `tool-${tool.id}`,
        type: "flowTool",
        position: { x: ITEMS_COL_X, y: toolsGroupY + GROUP_PADDING_TOP + i * ITEM_GAP_Y },
        data: {
          label: tool.label,
          name: tool.name,
          description: tool.description?.slice(0, 60) + (tool.description?.length > 60 ? "…" : "") || "",
          isConnected: assignedToolIds.has(tool.id),
          width: groupInnerWidth,
        },
      };
      result.push(node);
    });

    // ── 4. Agents Group Backdrop (dashed box) ───────────────────────────────

    if (otherAgents.length > 0) {
      const agentsBackdrop: DashedGroupNodeType = {
        id: "agents-backdrop",
        type: "dashedGroup",
        position: { x: ITEMS_COL_X - GROUP_PADDING_X, y: agentsGroupY },
        zIndex: -1,
        selectable: false,
        draggable: false,
        data: { label: "Call Agent", color: "#9c9af2", width: groupWidth, height: agentsGroupHeight },
      };
      result.push(agentsBackdrop);

      // ── 5. Individual Agent Nodes ───────────────────────────────────────

      otherAgents.forEach((ag, i) => {
        const node: CallableAgentNodeType = {
          id: `agent-${ag.id}`,
          type: "callableAgent",
          position: { x: ITEMS_COL_X, y: agentsGroupY + GROUP_PADDING_TOP + i * ITEM_GAP_Y },
          data: {
            name: ag.name,
            aiModel: ag.aiModel,
            isConnected: callableSet.has(ag.id),
            width: groupInnerWidth,
          },
        };
        result.push(node);
      });
    }

    return result;
  }, [
    agent,
    agents,
    allTools,
    toolAssignments,
    callableAgentIds,
    assignedToolIds,
    callableSet,
    selectedProviderId,
    aiModel,
    systemPrompt,
    name,
    description,
    onModelChange,
    onNameChange,
    onDescriptionChange,
    isPublic,
    onTogglePublish,
    publicPassword,
    onSavePassword,
  ]);

  // ─── Build Edges ────────────────────────────────────────────────────────────

  const edges = useMemo(() => {
    const result: Edge[] = [];

    // Edges from assigned tools → config node (tools handle)
    for (const assignment of toolAssignments) {
      result.push({
        id: `edge-tool-${assignment.toolId}`,
        source: `tool-${assignment.toolId}`,
        target: "config",
        targetHandle: "tools",
        type: "deletable",
        animated: true,
        selected: selectedEdgeId === `edge-tool-${assignment.toolId}`,
        data: { onDelete: () => onRemoveToolAssignment(assignment.toolId) },
        style: { stroke: TOOL_EDGE_COLOR, strokeWidth: 2, opacity: 0.5 },
      });
    }

    // Edges from callable agents → config node (agents handle)
    for (const agentId of callableAgentIds) {
      if (agentId === agent.id) continue;
      result.push({
        id: `edge-agent-${agentId}`,
        source: `agent-${agentId}`,
        target: "config",
        targetHandle: "agents",
        type: "deletable",
        animated: true,
        selected: selectedEdgeId === `edge-agent-${agentId}`,
        data: { onDelete: () => onRemoveCallableAgent(agentId) },
        style: { stroke: AGENT_EDGE_COLOR, strokeWidth: 2, opacity: 0.5 },
      });
    }

    // Edge from Chat node → config node (chat handle)
    result.push({
      id: "edge-chat",
      source: "chat",
      target: "config",
      targetHandle: "chat",
      type: "default",
      animated: true,
      selectable: false,
      deletable: false,
      style: { stroke: TOOL_EDGE_COLOR, strokeWidth: 1.5, opacity: 0.3 },
    });

    // Edge from Publish node → config node (publish handle)
    if (isPublic) {
      result.push({
        id: "edge-publish",
        source: "publish",
        target: "config",
        targetHandle: "publish",
        type: "default",
        animated: true,
        selectable: false,
        deletable: false,
        style: { stroke: PUBLISH_EDGE_COLOR, strokeWidth: 1.5, opacity: 0.35 },
      });
    }

    return result;
  }, [agent.id, toolAssignments, callableAgentIds, selectedEdgeId, onRemoveToolAssignment, onRemoveCallableAgent, isPublic]);

  // ─── Edge Delete Handler ───────────────────────────────────────────────────

  const onEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      for (const edge of deletedEdges) {
        if (edge.id.startsWith("edge-tool-")) {
          onRemoveToolAssignment(edge.id.replace("edge-tool-", ""));
        } else if (edge.id.startsWith("edge-agent-")) {
          onRemoveCallableAgent(edge.id.replace("edge-agent-", ""));
        }
      }
    },
    [onRemoveToolAssignment, onRemoveCallableAgent],
  );

  // ─── Connection Handler (drag to connect) ─────────────────────────────────

  const onConnect = useCallback(
    (connection: Connection) => {
      const sourceId = connection.source;
      if (!sourceId) return;

      if (sourceId.startsWith("tool-")) {
        const toolId = sourceId.replace("tool-", "");
        if (!assignedToolIds.has(toolId)) onAddToolAssignment(toolId);
      } else if (sourceId.startsWith("agent-")) {
        const agentId = sourceId.replace("agent-", "");
        if (!callableSet.has(agentId)) onAddCallableAgent(agentId);
      }
    },
    [assignedToolIds, callableSet, onAddToolAssignment, onAddCallableAgent],
  );

  // ─── Valid Connection Check ────────────────────────────────────────────────

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      const sourceId = connection.source;
      const targetId = connection.target;
      if (!sourceId || !targetId || targetId !== "config") return false;

      if (sourceId.startsWith("tool-")) {
        return !assignedToolIds.has(sourceId.replace("tool-", ""));
      }
      if (sourceId.startsWith("agent-")) {
        return !callableSet.has(sourceId.replace("agent-", ""));
      }
      return false;
    },
    [assignedToolIds, callableSet],
  );

  // ─── Edge Selection ────────────────────────────────────────────────────────

  const onEdgeClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeId((prev) => (prev === edge.id ? null : edge.id));
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedEdgeId(null);
  }, []);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 agent-detail-flow">
      <style>{`
        .agent-detail-flow .react-flow__renderer { background: var(--color-background) !important }
        .agent-detail-flow .react-flow__background pattern line { stroke: rgba(255,255,255,0.03) !important }
        .agent-detail-flow .react-flow__background pattern circle { fill: rgba(255,255,255,0.06) !important }
        .agent-detail-flow .react-flow__edge-path { stroke-width: 2 }
        .agent-detail-flow .react-flow__edge.animated .react-flow__edge-path { stroke-dasharray: 6 4; animation: agentFlowDash 1.2s linear infinite }
        .agent-detail-flow .react-flow__edge { cursor: pointer }
        .agent-detail-flow .react-flow__edge:hover .react-flow__edge-path { stroke-width: 3; opacity: 1 !important }
        .agent-detail-flow .react-flow__selection { background: rgba(168,255,83,0.08); border: 1px solid rgba(168,255,83,0.25) }
        @keyframes agentFlowDash { to { stroke-dashoffset: -20 } }
      `}</style>
      {/* ── Prompt Modal ── */}
      <SimpleDialog
        open={promptModalOpen}
        onClose={() => setPromptModalOpen(false)}
        title="System Prompt"
        width="90vw"
        height="85vh"
        noPadding
        icon={
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#a8ff53" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <line x1="10" y1="9" x2="8" y2="9" />
          </svg>
        }
      >
        <PromptPage />
      </SimpleDialog>

      {/* ── Chat Modal (full-screen) ── */}
      <SimpleDialog
        open={chatModalOpen}
        onClose={() => {
          setChatModalOpen(false);
          setSearchParams(
            (prev) => {
              const p = new URLSearchParams(prev);
              p.delete("conv");
              return p;
            },
            { replace: true },
          );
        }}
        title={`Chat with ${name || "Agent"}`}
        width="96vw"
        height="92vh"
        noPadding
        icon={
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#a8ff53" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        }
      >
        <ChatPage />
      </SimpleDialog>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onEdgesDelete={onEdgesDelete}
        onConnect={onConnect}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        isValidConnection={isValidConnection}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1.2 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: "deletable", animated: true }}
        nodesDraggable={true}
        nodesConnectable={true}
        elementsSelectable={true}
        deleteKeyCode="Backspace"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
      </ReactFlow>
    </div>
  );
}

// ─── Exported Component (with ReactFlowProvider) ────────────────────────────

export function AgentFlowView(props: AgentFlowViewProps) {
  return (
    <ReactFlowProvider>
      <AgentFlowInner {...props} />
    </ReactFlowProvider>
  );
}

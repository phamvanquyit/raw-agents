// ─── Agent Flow View ──────────────────────────────────────────────────────────
// React Flow canvas with current agent at center. To the right:
//   • Builtin Tools / Custom Tools — drag-connect
//   • MCP — server cards; popover toggles assign tools; edge if ≥1 connected
//   • Call Agent group — other agents, drag-connect to assign

import { Background, BackgroundVariant, type Connection, type Edge, type Node, ReactFlow, ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Modal } from "antd";
import { useCallback, useMemo, useState } from "react";
import type { Agent, AgentTool, AgentToolAssignment, McpServer } from "src/common/types";
import { PromptPage } from "../prompt/PromptPage";
import { DeletableEdge } from "./edges/DeletableEdge";
import { AgentConfigNode, type AgentConfigNodeType } from "./nodes/AgentConfigNode";
import { CallableAgentNode, type CallableAgentNodeType } from "./nodes/CallableAgentNode";
import { DashedGroupNode, type DashedGroupNodeType } from "./nodes/DashedGroupNode";
import { FlowToolNode, type FlowToolNodeType } from "./nodes/FlowToolNode";
import { McpServerNode, type McpServerNodeType } from "./nodes/McpServerNode";
import { PublishNode, type PublishNodeType } from "./nodes/PublishNode";

// ─── Node & Edge Types ──────────────────────────────────────────────────────

const nodeTypes = {
  flowTool: FlowToolNode,
  mcpServer: McpServerNode,
  callableAgent: CallableAgentNode,
  dashedGroup: DashedGroupNode,
  agentConfig: AgentConfigNode,
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
const GROUP_PADDING_TOP = 44; // space under group label (Tools / MCP / Call Agent)
const GROUP_PADDING_BOTTOM = 12;
const GROUP_GAP = 40; // gap between tool / MCP / agent groups
const MCP_PARENT_GAP_Y = 56; // vertical spacing between MCP server cards

// ─── Edge Colors ─────────────────────────────────────────────────────────────

const TOOL_EDGE_COLOR = "var(--edge-tool)";
const MCP_EDGE_COLOR = "var(--edge-mcp)";
const AGENT_EDGE_COLOR = "var(--edge-call-agent)";
const PUBLISH_EDGE_COLOR = "var(--edge-call-agent)";

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
  mcpServers: McpServer[];
  toolAssignments: AgentToolAssignment[];
  callableAgentIds: string[];
  onRemoveToolAssignment: (toolId: string) => void;
  onAddToolAssignment: (toolId: string) => void;
  onToggleMcpTools: (toolIds: string[], enable: boolean) => void;
  onAddCallableAgent: (agentId: string) => void;
  onRemoveCallableAgent: (agentId: string) => void;
  // Config node props
  selectedProviderId: string | null;
  aiModel: string;
  systemPrompt: string;
  name: string;
  description: string;
  avatar: string | null;
  onModelChange: (providerId: string, model: string) => void;
  onNameChange: (name: string) => void;
  onDescriptionChange: (desc: string) => void;
  onAvatarChange: (avatar: string) => void | Promise<void>;
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
  mcpServers,
  toolAssignments,
  callableAgentIds,
  onRemoveToolAssignment,
  onAddToolAssignment,
  onToggleMcpTools,
  onAddCallableAgent,
  onRemoveCallableAgent,
  selectedProviderId,
  aiModel,
  systemPrompt,
  name,
  description,
  avatar,
  onModelChange,
  onNameChange,
  onDescriptionChange,
  onAvatarChange,
  isPublic,
  onTogglePublish,
  publicPassword,
  onSavePassword,
}: AgentFlowViewProps) {
  const assignedToolIds = useMemo(() => new Set(toolAssignments.map((a) => a.toolId)), [toolAssignments]);
  const callableSet = useMemo(() => new Set(callableAgentIds), [callableAgentIds]);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [promptModalOpen, setPromptModalOpen] = useState(false);

  const handleToggleMcpTool = useCallback(
    (toolId: string, connected: boolean) => {
      if (connected) onAddToolAssignment(toolId);
      else onRemoveToolAssignment(toolId);
    },
    [onAddToolAssignment, onRemoveToolAssignment],
  );

  const handleToggleAllMcpTools = useCallback(
    (toolIds: string[], enable: boolean) => {
      onToggleMcpTools(toolIds, enable);
    },
    [onToggleMcpTools],
  );

  // ─── Build Nodes ────────────────────────────────────────────────────────────

  const nodes = useMemo(() => {
    const result: Node[] = [];

    // ── Prepare data ────────────────────────────────────────────────────────

    const activeTools = allTools.filter((t) => t.isActive !== false && t.name !== "call_agent");

    const builtinTools = activeTools.filter((t) => t.id.startsWith("builtin:")).sort((a, b) => (a.label || a.name).localeCompare(b.label || b.name));
    const customTools = activeTools.filter((t) => !t.id.startsWith("builtin:")).sort((a, b) => (a.label || a.name).localeCompare(b.label || b.name));

    const mcpGroups: { serverId: string; name: string; tools: { id: string; label: string }[] }[] = [];
    for (const server of mcpServers) {
      if (server.isActive === false) continue;
      const catalog = [...(server.tools ?? [])].sort((a, b) => a.name.localeCompare(b.name));
      if (catalog.length === 0) continue;
      mcpGroups.push({
        serverId: server.id,
        name: server.name,
        tools: catalog.map((t) => ({
          id: `mcp:${server.id}:${t.name}`,
          label: t.name,
        })),
      });
    }

    const otherAgents = agents.filter((a) => a.id !== agent.id).sort((a, b) => a.name.localeCompare(b.name));

    // ── Measure widths ──────────────────────────────────────────────────────

    const ITEM_FIXED_WIDTH = 56;
    const toolLabels = [...builtinTools, ...customTools].map((t) => t.label || t.name);
    const mcpParentLabels = mcpGroups.map((g) => g.name);
    const agentLabels = otherAgents.map((a) => a.name);
    const parentMaxText = measureMaxTextWidth([...toolLabels, ...mcpParentLabels, ...agentLabels]);
    const groupInnerWidth = Math.ceil(parentMaxText + ITEM_FIXED_WIDTH + 24);
    const groupWidth = groupInnerWidth + 2 * GROUP_PADDING_X;

    // ── Calculate group heights & positions ─────────────────────────────────

    const builtinGroupHeight = builtinTools.length > 0 ? GROUP_PADDING_TOP + builtinTools.length * ITEM_GAP_Y + GROUP_PADDING_BOTTOM : 0;
    const customGroupHeight = customTools.length > 0 ? GROUP_PADDING_TOP + customTools.length * ITEM_GAP_Y + GROUP_PADDING_BOTTOM : 0;
    const mcpStackHeight = mcpGroups.length > 0 ? mcpGroups.length * MCP_PARENT_GAP_Y : 0;
    const mcpSectionHeight = mcpStackHeight > 0 ? GROUP_PADDING_TOP + mcpStackHeight + GROUP_PADDING_BOTTOM : 0;
    const agentsGroupHeight = otherAgents.length > 0 ? GROUP_PADDING_TOP + otherAgents.length * ITEM_GAP_Y + GROUP_PADDING_BOTTOM : 0;

    const sections: number[] = [];
    if (builtinGroupHeight > 0) sections.push(builtinGroupHeight);
    if (customGroupHeight > 0) sections.push(customGroupHeight);
    if (mcpSectionHeight > 0) sections.push(mcpSectionHeight);
    if (agentsGroupHeight > 0) sections.push(agentsGroupHeight);

    const totalHeight = sections.reduce((sum, h) => sum + h, 0) + Math.max(0, sections.length - 1) * GROUP_GAP;

    let cursorY = CENTER_Y - totalHeight / 2 + 20;
    const builtinGroupY = cursorY;
    if (builtinGroupHeight > 0) cursorY += builtinGroupHeight + GROUP_GAP;
    const customGroupY = cursorY;
    if (customGroupHeight > 0) cursorY += customGroupHeight + GROUP_GAP;

    const mcpSectionY = cursorY;
    if (mcpSectionHeight > 0) cursorY += mcpSectionHeight + GROUP_GAP;
    const agentsGroupY = cursorY;

    // ── 0. Config Node (central node) ──────────────────────────────────────

    const configNode: AgentConfigNodeType = {
      id: "config",
      type: "agentConfig",
      position: { x: CENTER_X - 190, y: CENTER_Y - 40 },
      style: { width: 380, height: 560 },
      data: {
        name,
        description,
        avatar,
        selectedProviderId,
        aiModel,
        systemPrompt,
        onNameChange,
        onDescriptionChange,
        onAvatarChange,
        onModelChange,
        onOpenPrompt: () => setPromptModalOpen(true),
        isPublic,
        onTogglePublish,
      },
    };
    result.push(configNode);

    // ── 0b. Publish Node (left of config, visible when public) ──────────

    if (isPublic) {
      const publishNode: PublishNodeType = {
        id: "publish",
        type: "publish",
        position: { x: CENTER_X - 190 - 220, y: CENTER_Y + 440 },
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

    // ── 1. Builtin Tools Group ──────────────────────────────────────────────

    if (builtinTools.length > 0) {
      const builtinBackdrop: DashedGroupNodeType = {
        id: "builtin-tools-backdrop",
        type: "dashedGroup",
        position: { x: ITEMS_COL_X - GROUP_PADDING_X, y: builtinGroupY },
        zIndex: -1,
        selectable: false,
        draggable: false,
        data: { label: "Builtin Tools", color: "var(--edge-tool)", width: groupWidth, height: builtinGroupHeight },
      };
      result.push(builtinBackdrop);

      builtinTools.forEach((tool, i) => {
        const node: FlowToolNodeType = {
          id: `tool-${tool.id}`,
          type: "flowTool",
          position: { x: ITEMS_COL_X, y: builtinGroupY + GROUP_PADDING_TOP + i * ITEM_GAP_Y },
          data: {
            label: tool.label || tool.name,
            name: tool.name,
            description: tool.description?.slice(0, 60) + (tool.description?.length > 60 ? "…" : "") || "",
            isConnected: assignedToolIds.has(tool.id),
            width: groupInnerWidth,
          },
        };
        result.push(node);
      });
    }

    // ── 1b. Custom Tools Group ──────────────────────────────────────────────

    if (customTools.length > 0) {
      const customBackdrop: DashedGroupNodeType = {
        id: "custom-tools-backdrop",
        type: "dashedGroup",
        position: { x: ITEMS_COL_X - GROUP_PADDING_X, y: customGroupY },
        zIndex: -1,
        selectable: false,
        draggable: false,
        data: { label: "Custom Tools", color: "var(--edge-call-agent)", width: groupWidth, height: customGroupHeight },
      };
      result.push(customBackdrop);

      customTools.forEach((tool, i) => {
        const node: FlowToolNodeType = {
          id: `tool-${tool.id}`,
          type: "flowTool",
          position: { x: ITEMS_COL_X, y: customGroupY + GROUP_PADDING_TOP + i * ITEM_GAP_Y },
          data: {
            label: tool.label || tool.name,
            name: tool.name,
            description: tool.description?.slice(0, 60) + (tool.description?.length > 60 ? "…" : "") || "",
            isConnected: assignedToolIds.has(tool.id),
            width: groupInnerWidth,
          },
        };
        result.push(node);
      });
    }

    // ── 2. MCP Section — server cards with popover toggles ──────────────────

    if (mcpGroups.length > 0) {
      const mcpBackdrop: DashedGroupNodeType = {
        id: "mcp-backdrop",
        type: "dashedGroup",
        position: { x: ITEMS_COL_X - GROUP_PADDING_X, y: mcpSectionY },
        zIndex: -1,
        selectable: false,
        draggable: false,
        data: { label: "MCP", color: "var(--edge-mcp)", width: groupWidth, height: mcpSectionHeight },
      };
      result.push(mcpBackdrop);

      mcpGroups.forEach((group, gi) => {
        const parentY = mcpSectionY + GROUP_PADDING_TOP + gi * MCP_PARENT_GAP_Y;

        const parent: McpServerNodeType = {
          id: `mcp-server-${group.serverId}`,
          type: "mcpServer",
          position: { x: ITEMS_COL_X, y: parentY },
          draggable: false,
          connectable: false,
          data: {
            name: group.name,
            width: groupInnerWidth,
            tools: group.tools.map((tool) => ({
              id: tool.id,
              label: tool.label,
              connected: assignedToolIds.has(tool.id),
            })),
            onToggleTool: handleToggleMcpTool,
            onToggleAll: handleToggleAllMcpTools,
          },
        };
        result.push(parent);
      });
    }

    // ── 3. Agents Group ─────────────────────────────────────────────────────

    if (otherAgents.length > 0) {
      const agentsBackdrop: DashedGroupNodeType = {
        id: "agents-backdrop",
        type: "dashedGroup",
        position: { x: ITEMS_COL_X - GROUP_PADDING_X, y: agentsGroupY },
        zIndex: -1,
        selectable: false,
        draggable: false,
        data: { label: "Call Agent", color: "var(--edge-call-agent)", width: groupWidth, height: agentsGroupHeight },
      };
      result.push(agentsBackdrop);

      otherAgents.forEach((ag, i) => {
        const node: CallableAgentNodeType = {
          id: `agent-${ag.id}`,
          type: "callableAgent",
          position: { x: ITEMS_COL_X, y: agentsGroupY + GROUP_PADDING_TOP + i * ITEM_GAP_Y },
          data: {
            name: ag.name,
            avatar: ag.avatar,
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
    mcpServers,
    toolAssignments,
    callableAgentIds,
    assignedToolIds,
    callableSet,
    handleToggleMcpTool,
    handleToggleAllMcpTools,
    selectedProviderId,
    aiModel,
    systemPrompt,
    name,
    description,
    avatar,
    onModelChange,
    onNameChange,
    onDescriptionChange,
    onAvatarChange,
    isPublic,
    onTogglePublish,
    publicPassword,
    onSavePassword,
  ]);

  // Tools that belong to an MCP server (edges go from server node, not tool node)
  const mcpToolIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of mcpServers) {
      for (const t of s.tools ?? []) {
        ids.add(`mcp:${s.id}:${t.name}`);
      }
    }
    return ids;
  }, [mcpServers]);

  const mcpServerConnectedIds = useMemo(() => {
    const byServer = new Map<string, string[]>();
    for (const toolId of assignedToolIds) {
      if (!toolId.startsWith("mcp:")) continue;
      const rest = toolId.slice(4);
      const idx = rest.indexOf(":");
      if (idx <= 0) continue;
      const serverId = rest.slice(0, idx);
      if (!byServer.has(serverId)) byServer.set(serverId, []);
      byServer.get(serverId)!.push(toolId);
    }
    return byServer;
  }, [assignedToolIds]);

  // ─── Build Edges ────────────────────────────────────────────────────────────

  const edges = useMemo(() => {
    const result: Edge[] = [];

    // Edges from assigned local tools → config
    for (const assignment of toolAssignments) {
      if (mcpToolIds.has(assignment.toolId)) continue;
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

    // One edge per MCP server that has ≥1 connected tool
    for (const [serverId, toolIds] of mcpServerConnectedIds) {
      result.push({
        id: `edge-mcp-${serverId}`,
        source: `mcp-server-${serverId}`,
        target: "config",
        targetHandle: "tools",
        type: "deletable",
        animated: true,
        selected: selectedEdgeId === `edge-mcp-${serverId}`,
        data: {
          onDelete: () => onToggleMcpTools(toolIds, false),
        },
        style: { stroke: MCP_EDGE_COLOR, strokeWidth: 2, opacity: 0.5 },
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
  }, [
    agent.id,
    toolAssignments,
    callableAgentIds,
    selectedEdgeId,
    onRemoveToolAssignment,
    onToggleMcpTools,
    onRemoveCallableAgent,
    isPublic,
    mcpToolIds,
    mcpServerConnectedIds,
  ]);

  // ─── Edge Delete Handler ───────────────────────────────────────────────────

  const onEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      for (const edge of deletedEdges) {
        if (edge.id.startsWith("edge-tool-")) {
          onRemoveToolAssignment(edge.id.replace("edge-tool-", ""));
        } else if (edge.id.startsWith("edge-mcp-")) {
          const serverId = edge.id.replace("edge-mcp-", "");
          const toolIds = mcpServerConnectedIds.get(serverId) ?? [];
          onToggleMcpTools(toolIds, false);
        } else if (edge.id.startsWith("edge-agent-")) {
          onRemoveCallableAgent(edge.id.replace("edge-agent-", ""));
        }
      }
    },
    [onRemoveToolAssignment, onToggleMcpTools, onRemoveCallableAgent, mcpServerConnectedIds],
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
        .agent-detail-flow .react-flow__renderer { background: var(--card) !important }
        .agent-detail-flow .react-flow__background pattern line { stroke: rgba(255,255,255,0.03) !important }
        .agent-detail-flow .react-flow__background pattern circle { fill: rgba(255,255,255,0.06) !important }
        .agent-detail-flow .react-flow__edge-path { stroke-width: 2 }
        .agent-detail-flow .react-flow__edge.animated .react-flow__edge-path { stroke-dasharray: 6 4; animation: agentFlowDash 1.2s linear infinite }
        .agent-detail-flow .react-flow__edge { cursor: pointer }
        .agent-detail-flow .react-flow__edge:hover .react-flow__edge-path { stroke-width: 3; opacity: 1 !important }
        .agent-detail-flow .react-flow__selection { background: color-mix(in srgb, var(--primary) 8%, transparent); border: 1px solid color-mix(in srgb, var(--primary) 25%, transparent) }
        @keyframes agentFlowDash { to { stroke-dashoffset: -20 } }
      `}</style>
      {/* ── Prompt Modal ── */}
      <Modal
        open={promptModalOpen}
        onCancel={() => setPromptModalOpen(false)}
        title={null}
        closable={false}
        footer={null}
        width="100%"
        destroyOnHidden
        style={{ top: 0, margin: 0, paddingBottom: 0, maxWidth: "100vw" }}
        styles={{
          container: {
            height: "100vh",
            borderRadius: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            background: "var(--background)",
            boxShadow: "none",
          },
          body: {
            padding: 0,
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        <PromptPage onClose={() => setPromptModalOpen(false)} />
      </Modal>

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

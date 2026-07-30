// ─── Agent Flow View ──────────────────────────────────────────────────────────
// React Flow canvas with current agent at center. To the right:
//   • Tools — single card; popover toggles builtin + folder tools
//     Connected folders fan out mid-level, then each fans out to its tools
//   • MCP Servers — single card; popover toggles tools grouped by server
//     Connected servers fan out mid-level, then each fans out to its tools
//   • Call Agents — single card; popover toggles agents grouped by team
//     Connected agents fan out as child nodes to the right of Call Agents

import { Background, BackgroundVariant, type Connection, type Edge, type Node, ReactFlow, ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Modal } from "antd";
import { useCallback, useMemo, useState } from "react";
import type { Agent, AgentListItem, AgentTeam, AgentTool, AgentToolAssignment, McpServer, ToolFolder } from "src/common/types";
import { PromptPage } from "../prompt/PromptPage";
import { DeletableEdge } from "./edges/DeletableEdge";
import { layoutFanoutSection, layoutTwoLevelFanout, measureChildWidth } from "./layout";
import { AgentConfigNode, type AgentConfigNodeType } from "./nodes/AgentConfigNode";
import { type CallAgentTeamGroup, CallAgentsNode, type CallAgentsNodeType } from "./nodes/CallAgentsNode";
import { CallableAgentNode, type CallableAgentNodeType } from "./nodes/CallableAgentNode";
import { ConnectedToolNode, type ConnectedToolNodeType } from "./nodes/ConnectedToolNode";
import { GroupBranchNode, type GroupBranchNodeType } from "./nodes/GroupBranchNode";
import { type McpServerGroup, McpServersNode, type McpServersNodeType } from "./nodes/McpServersNode";
import { PublishNode, type PublishNodeType } from "./nodes/PublishNode";
import { type ToolFolderGroup, ToolsNode, type ToolsNodeType } from "./nodes/ToolsNode";

// ─── Node & Edge Types ──────────────────────────────────────────────────────

const nodeTypes = {
  tools: ToolsNode,
  connectedTool: ConnectedToolNode,
  groupBranch: GroupBranchNode,
  mcpServers: McpServersNode,
  callAgents: CallAgentsNode,
  callableAgent: CallableAgentNode,
  agentConfig: AgentConfigNode,
  publish: PublishNode,
};

const edgeTypes = {
  deletable: DeletableEdge,
};

// ─── Layout Constants ────────────────────────────────────────────────────────

const CENTER_X = 500;
const CENTER_Y = 400;

const ITEMS_COL_X = CENTER_X + 420;
const SIDE_CARD_H = 56;
const FANOUT_CHILD_GAP_X = 100; // gap between levels of fan-out
const FANOUT_CHILD_GAP_Y = 56; // vertical spacing between sibling children
const FANOUT_CHILD_H = 40; // plain child card height (tool / agent leaf)
const GROUP_MID_H = 40; // folder / MCP server mid-level card height (single line)
const TOOL_CHILD_CHROME = 28; // paddings for connected tool cards
const GROUP_MID_CHROME = 36; // paddings for folder / MCP mid branch cards
const AGENT_CHILD_CHROME = 64; // avatar + gaps + paddings for callable agent cards
const SECTION_GAP = 28; // min vertical gap between packed sections

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
  agents: AgentListItem[];
  teams: AgentTeam[];
  toolFolders: ToolFolder[];
  allTools: AgentTool[];
  mcpServers: McpServer[];
  toolAssignments: AgentToolAssignment[];
  callableAgentIds: string[];
  onRemoveToolAssignment: (toolId: string) => void;
  onAddToolAssignment: (toolId: string) => void;
  onToggleMcpTools: (toolIds: string[], enable: boolean) => void;
  onToggleCallableAgent: (agentId: string, enable: boolean) => void;
  onToggleCallableAgents: (agentIds: string[], enable: boolean) => void;
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
  teams,
  toolFolders,
  allTools,
  mcpServers,
  toolAssignments,
  callableAgentIds,
  onRemoveToolAssignment,
  onAddToolAssignment,
  onToggleMcpTools,
  onToggleCallableAgent,
  onToggleCallableAgents,
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

  const handleToggleTool = useCallback(
    (toolId: string, connected: boolean) => {
      if (connected) onAddToolAssignment(toolId);
      else onRemoveToolAssignment(toolId);
    },
    [onAddToolAssignment, onRemoveToolAssignment],
  );

  const toolGroups = useMemo((): ToolFolderGroup[] => {
    const activeTools = allTools.filter((t) => t.isActive !== false && t.name !== "call_agent");
    const builtin: ToolToggleLike[] = [];
    const byFolder = new Map<string | null, ToolToggleLike[]>();
    const folderMeta = new Map(toolFolders.map((f) => [f.id, f]));

    for (const tool of activeTools) {
      const item = {
        id: tool.id,
        label: tool.label || tool.name,
        connected: assignedToolIds.has(tool.id),
        sortOrder: tool.sortOrder ?? 0,
      };
      if (tool.id.startsWith("builtin:")) {
        builtin.push(item);
        continue;
      }
      const fid = tool.folderId && folderMeta.has(tool.folderId) ? tool.folderId : null;
      if (!byFolder.has(fid)) byFolder.set(fid, []);
      byFolder.get(fid)!.push(item);
    }

    const sortTools = (items: ToolToggleLike[]) =>
      [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)).map(({ id, label, connected }) => ({ id, label, connected }));

    const groups: ToolFolderGroup[] = [];
    if (builtin.length > 0) {
      groups.push({ id: "__builtin__", name: "Builtin Tools", tools: sortTools(builtin) });
    }

    const folderGroups = [...byFolder.entries()]
      .map(([fid, items]) => ({
        id: fid,
        name: fid ? (folderMeta.get(fid)?.name ?? "Folder") : "Ungrouped",
        sortOrder: fid ? (folderMeta.get(fid)?.sortOrder ?? 0) : Number.MAX_SAFE_INTEGER,
        tools: sortTools(items),
      }))
      .filter((g) => g.tools.length > 0)
      .sort((a, b) => {
        if (a.id === null) return 1;
        if (b.id === null) return -1;
        return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
      })
      .map(({ id, name, tools }) => ({ id, name, tools }));

    groups.push(...folderGroups);
    return groups;
  }, [allTools, toolFolders, assignedToolIds]);

  const callAgentTeams = useMemo((): CallAgentTeamGroup[] => {
    const otherAgents = agents.filter((a) => a.id !== agent.id).sort((a, b) => a.name.localeCompare(b.name));
    const teamMeta = new Map(teams.map((t) => [t.id, t]));
    const byTeam = new Map<string | null, CallAgentTeamGroup>();

    for (const ag of otherAgents) {
      const tid = ag.teamId && teamMeta.has(ag.teamId) ? ag.teamId : null;
      if (!byTeam.has(tid)) {
        byTeam.set(tid, {
          id: tid,
          name: tid ? (teamMeta.get(tid)?.name ?? "Team") : "No team",
          agents: [],
        });
      }
      byTeam.get(tid)!.agents.push({
        id: ag.id,
        name: ag.name,
        avatar: ag.avatar,
        teamId: ag.teamId,
        connected: callableSet.has(ag.id),
      });
    }

    return [...byTeam.values()].sort((a, b) => {
      if (a.id === null) return 1;
      if (b.id === null) return -1;
      return a.name.localeCompare(b.name);
    });
  }, [agents, agent.id, teams, callableSet]);

  // ─── Build Nodes ────────────────────────────────────────────────────────────

  const nodes = useMemo(() => {
    const result: Node[] = [];

    const mcpGroups: McpServerGroup[] = [];
    for (const server of mcpServers) {
      if (server.isActive === false) continue;
      const catalog = [...(server.tools ?? [])].sort((a, b) => a.name.localeCompare(b.name));
      if (catalog.length === 0) continue;
      mcpGroups.push({
        id: server.id,
        name: server.name,
        tools: catalog.map((t) => ({
          id: `mcp:${server.id}:${t.name}`,
          label: t.name,
          connected: assignedToolIds.has(`mcp:${server.id}:${t.name}`),
        })),
      });
    }

    // ── Measure widths ──────────────────────────────────────────────────────

    const ITEM_FIXED_WIDTH = 88;
    const SIDE_CARD_MIN_W = 200;
    const parentMaxText = measureMaxTextWidth(["Tools", "MCP Servers", "Call Agents"]);
    const groupInnerWidth = Math.max(SIDE_CARD_MIN_W, Math.ceil(parentMaxText + ITEM_FIXED_WIDTH));

    // ── Connected children (needed for auto layout) ─────────────────────────

    // Only folders that have ≥1 connected tool appear as mid-level branches
    const connectedToolBranches = toolGroups
      .map((g) => ({
        id: String(g.id ?? "__ungrouped__"),
        name: g.name,
        tools: g.tools.filter((t) => t.connected).sort((a, b) => a.label.localeCompare(b.label)),
      }))
      .filter((g) => g.tools.length > 0);

    // Only servers that have ≥1 connected tool appear as mid-level branches
    const connectedMcpBranches = mcpGroups
      .map((g) => ({
        id: g.id,
        name: g.name,
        tools: g.tools.filter((t) => t.connected).sort((a, b) => a.label.localeCompare(b.label)),
      }))
      .filter((g) => g.tools.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));

    const connectedAgents = callAgentTeams
      .flatMap((t) => t.agents)
      .filter((a) => a.connected)
      .sort((a, b) => a.name.localeCompare(b.name));

    // ── Pack sections top→bottom so fan-outs never collide ──────────────────

    const toolsLayout0 = layoutTwoLevelFanout(
      0,
      SIDE_CARD_H,
      connectedToolBranches.map((b) => b.tools.length),
      GROUP_MID_H,
      FANOUT_CHILD_GAP_Y,
      FANOUT_CHILD_H,
      SECTION_GAP,
    );
    const toolsSectionH = toolsLayout0.sectionHeight;

    const mcpLayout0 = layoutTwoLevelFanout(
      0,
      SIDE_CARD_H,
      connectedMcpBranches.map((b) => b.tools.length),
      GROUP_MID_H,
      FANOUT_CHILD_GAP_Y,
      FANOUT_CHILD_H,
      SECTION_GAP,
    );
    const mcpSectionH = mcpGroups.length > 0 ? mcpLayout0.sectionHeight : 0;

    const agentsLayout0 = layoutFanoutSection(0, SIDE_CARD_H, connectedAgents.length, FANOUT_CHILD_GAP_Y, FANOUT_CHILD_H);
    const agentsSectionH = agentsLayout0.sectionBottom;

    const sectionHeights: number[] = [toolsSectionH];
    if (mcpGroups.length > 0) sectionHeights.push(mcpSectionH);
    sectionHeights.push(agentsSectionH);

    const totalHeight = sectionHeights.reduce((sum, h) => sum + h, 0) + Math.max(0, sectionHeights.length - 1) * SECTION_GAP;

    let cursorY = CENTER_Y - totalHeight / 2 + 20;

    const toolsLayout = layoutTwoLevelFanout(
      cursorY,
      SIDE_CARD_H,
      connectedToolBranches.map((b) => b.tools.length),
      GROUP_MID_H,
      FANOUT_CHILD_GAP_Y,
      FANOUT_CHILD_H,
      SECTION_GAP,
    );
    cursorY = toolsLayout.sectionBottom + SECTION_GAP;

    const mcpLayout = layoutTwoLevelFanout(
      cursorY,
      SIDE_CARD_H,
      connectedMcpBranches.map((b) => b.tools.length),
      GROUP_MID_H,
      FANOUT_CHILD_GAP_Y,
      FANOUT_CHILD_H,
      SECTION_GAP,
    );
    if (mcpGroups.length > 0) {
      cursorY = mcpLayout.sectionBottom + SECTION_GAP;
    }

    const agentsLayout = layoutFanoutSection(cursorY, SIDE_CARD_H, connectedAgents.length, FANOUT_CHILD_GAP_Y, FANOUT_CHILD_H);

    const midX = ITEMS_COL_X + groupInnerWidth + FANOUT_CHILD_GAP_X;
    // leaf column shares width with mid column for a clean cascade
    const leafX = midX + groupInnerWidth + FANOUT_CHILD_GAP_X;

    // ── 0. Config Node (central node) ──────────────────────────────────────

    const configNode: AgentConfigNodeType = {
      id: "config",
      type: "agentConfig",
      position: { x: CENTER_X - 190, y: CENTER_Y - 40 },
      style: { width: 380, height: "auto" },
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

    // ── 1. Tools — root → folder branches → tool leaves ────────────────────

    {
      const toolsNode: ToolsNodeType = {
        id: "tools",
        type: "tools",
        position: { x: ITEMS_COL_X, y: toolsLayout.rootY },
        draggable: false,
        connectable: false,
        data: {
          groups: toolGroups,
          width: groupInnerWidth,
          onToggleTool: handleToggleTool,
        },
      };
      result.push(toolsNode);

      if (connectedToolBranches.length > 0) {
        const midWidth = measureChildWidth(
          connectedToolBranches.map((b) => b.name),
          GROUP_MID_CHROME,
          groupInnerWidth,
          measureMaxTextWidth,
        );
        const leafWidth = measureChildWidth(
          connectedToolBranches.flatMap((b) => b.tools.map((t) => t.label)),
          TOOL_CHILD_CHROME,
          groupInnerWidth,
          measureMaxTextWidth,
        );

        connectedToolBranches.forEach((branch, bi) => {
          const bl = toolsLayout.branches[bi]!;

          const mid: GroupBranchNodeType = {
            id: `tool-folder-${branch.id}`,
            type: "groupBranch",
            position: { x: midX, y: bl.midY },
            draggable: false,
            connectable: false,
            selectable: false,
            data: {
              name: branch.name,
              width: midWidth,
              accent: "tool",
            },
          };
          result.push(mid);

          branch.tools.forEach((tool, ti) => {
            const leaf: ConnectedToolNodeType = {
              id: `tool-child-${tool.id}`,
              type: "connectedTool",
              position: { x: leafX, y: bl.leafTop + ti * FANOUT_CHILD_GAP_Y },
              draggable: false,
              connectable: false,
              selectable: false,
              data: {
                label: tool.label,
                width: leafWidth,
                accent: "tool",
              },
            };
            result.push(leaf);
          });
        });
      }
    }

    // ── 2. MCP Servers — root → server branches → tool leaves ────────────

    if (mcpGroups.length > 0) {
      const mcpNode: McpServersNodeType = {
        id: "mcp-servers",
        type: "mcpServers",
        position: { x: ITEMS_COL_X, y: mcpLayout.rootY },
        draggable: false,
        connectable: false,
        data: {
          groups: mcpGroups,
          width: groupInnerWidth,
          onToggleTool: handleToggleTool,
        },
      };
      result.push(mcpNode);

      if (connectedMcpBranches.length > 0) {
        const midWidth = measureChildWidth(
          connectedMcpBranches.map((b) => b.name),
          GROUP_MID_CHROME,
          groupInnerWidth,
          measureMaxTextWidth,
        );
        const leafWidth = measureChildWidth(
          connectedMcpBranches.flatMap((b) => b.tools.map((t) => t.label)),
          TOOL_CHILD_CHROME,
          groupInnerWidth,
          measureMaxTextWidth,
        );

        connectedMcpBranches.forEach((branch, bi) => {
          const bl = mcpLayout.branches[bi]!;

          const mid: GroupBranchNodeType = {
            id: `mcp-branch-${branch.id}`,
            type: "groupBranch",
            position: { x: midX, y: bl.midY },
            draggable: false,
            connectable: false,
            selectable: false,
            data: {
              name: branch.name,
              width: midWidth,
              accent: "mcp",
            },
          };
          result.push(mid);

          branch.tools.forEach((tool, ti) => {
            const leaf: ConnectedToolNodeType = {
              id: `tool-child-${tool.id}`,
              type: "connectedTool",
              position: { x: leafX, y: bl.leafTop + ti * FANOUT_CHILD_GAP_Y },
              draggable: false,
              connectable: false,
              selectable: false,
              data: {
                label: tool.label,
                width: leafWidth,
                accent: "mcp",
              },
            };
            result.push(leaf);
          });
        });
      }
    }

    // ── 3. Call Agents — single card + fan-out children ────────────────────

    {
      const callAgentsNode: CallAgentsNodeType = {
        id: "call-agents",
        type: "callAgents",
        position: { x: ITEMS_COL_X, y: agentsLayout.parentY },
        draggable: false,
        connectable: false,
        data: {
          teams: callAgentTeams,
          width: groupInnerWidth,
          onToggleAgent: onToggleCallableAgent,
        },
      };
      result.push(callAgentsNode);

      if (connectedAgents.length > 0) {
        const childWidth = measureChildWidth(
          connectedAgents.map((a) => a.name),
          AGENT_CHILD_CHROME,
          groupInnerWidth,
          measureMaxTextWidth,
        );

        connectedAgents.forEach((ag, i) => {
          const child: CallableAgentNodeType = {
            id: `agent-${ag.id}`,
            type: "callableAgent",
            position: { x: midX, y: agentsLayout.childTop + i * FANOUT_CHILD_GAP_Y },
            draggable: false,
            connectable: false,
            selectable: false,
            data: {
              name: ag.name,
              avatar: ag.avatar,
              width: childWidth,
            },
          };
          result.push(child);
        });
      }
    }

    return result;
  }, [
    agent,
    mcpServers,
    toolGroups,
    callAgentTeams,
    assignedToolIds,
    handleToggleTool,
    onToggleCallableAgent,
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

  const localAssignedToolIds = useMemo(() => toolAssignments.map((a) => a.toolId).filter((id) => !mcpToolIds.has(id)), [toolAssignments, mcpToolIds]);

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

    // Tools: root → config, root → each connected folder branch → tool leaves
    if (localAssignedToolIds.length > 0) {
      result.push({
        id: "edge-tools",
        source: "tools",
        sourceHandle: "to-config",
        target: "config",
        targetHandle: "tools",
        type: "deletable",
        animated: true,
        selected: selectedEdgeId === "edge-tools",
        data: {
          onDelete: () => {
            for (const toolId of localAssignedToolIds) onRemoveToolAssignment(toolId);
          },
        },
        style: { stroke: TOOL_EDGE_COLOR, strokeWidth: 2, opacity: 0.5 },
      });

      // Rebuild folder → tool map from current groups so branch ids match nodes
      for (const group of toolGroups) {
        const connected = group.tools.filter((t) => localAssignedToolIds.includes(t.id));
        if (connected.length === 0) continue;
        const folderId = String(group.id ?? "__ungrouped__");

        result.push({
          id: `edge-tool-folder-${folderId}`,
          source: "tools",
          sourceHandle: "to-folders",
          target: `tool-folder-${folderId}`,
          type: "default",
          animated: true,
          selectable: false,
          deletable: false,
          focusable: false,
          style: { stroke: TOOL_EDGE_COLOR, strokeWidth: 1.5, opacity: 0.45 },
        });

        for (const tool of connected) {
          result.push({
            id: `edge-tool-child-${tool.id}`,
            source: `tool-folder-${folderId}`,
            sourceHandle: "to-leaves",
            target: `tool-child-${tool.id}`,
            type: "default",
            animated: true,
            selectable: false,
            deletable: false,
            focusable: false,
            style: { stroke: TOOL_EDGE_COLOR, strokeWidth: 1.5, opacity: 0.45 },
          });
        }
      }
    }

    // MCP: root → config, root → each connected server branch → tool leaves
    const allMcpConnectedIds = [...mcpServerConnectedIds.values()].flat();
    if (allMcpConnectedIds.length > 0) {
      result.push({
        id: "edge-mcp-servers",
        source: "mcp-servers",
        sourceHandle: "to-config",
        target: "config",
        targetHandle: "tools",
        type: "deletable",
        animated: true,
        selected: selectedEdgeId === "edge-mcp-servers",
        data: {
          onDelete: () => onToggleMcpTools(allMcpConnectedIds, false),
        },
        style: { stroke: MCP_EDGE_COLOR, strokeWidth: 2, opacity: 0.5 },
      });

      for (const [serverId, toolIds] of mcpServerConnectedIds) {
        result.push({
          id: `edge-mcp-branch-${serverId}`,
          source: "mcp-servers",
          sourceHandle: "to-servers",
          target: `mcp-branch-${serverId}`,
          type: "default",
          animated: true,
          selectable: false,
          deletable: false,
          focusable: false,
          style: { stroke: MCP_EDGE_COLOR, strokeWidth: 1.5, opacity: 0.45 },
        });

        for (const toolId of toolIds) {
          result.push({
            id: `edge-mcp-child-${toolId}`,
            source: `mcp-branch-${serverId}`,
            sourceHandle: "to-leaves",
            target: `tool-child-${toolId}`,
            type: "default",
            animated: true,
            selectable: false,
            deletable: false,
            focusable: false,
            style: { stroke: MCP_EDGE_COLOR, strokeWidth: 1.5, opacity: 0.45 },
          });
        }
      }
    }

    // One edge from Call Agents card → config when ≥1 agent is connected
    if (callableAgentIds.length > 0) {
      result.push({
        id: "edge-call-agents",
        source: "call-agents",
        sourceHandle: "to-config",
        target: "config",
        targetHandle: "agents",
        type: "deletable",
        animated: true,
        selected: selectedEdgeId === "edge-call-agents",
        data: {
          onDelete: () => onToggleCallableAgents([...callableAgentIds], false),
        },
        style: { stroke: AGENT_EDGE_COLOR, strokeWidth: 2, opacity: 0.5 },
      });

      // Fan-out branches: Call Agents → each connected child agent (display only)
      for (const agentId of callableAgentIds) {
        result.push({
          id: `edge-call-child-${agentId}`,
          source: "call-agents",
          sourceHandle: "to-agents",
          target: `agent-${agentId}`,
          type: "default",
          animated: true,
          selectable: false,
          deletable: false,
          focusable: false,
          style: { stroke: AGENT_EDGE_COLOR, strokeWidth: 1.5, opacity: 0.45 },
        });
      }
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
    localAssignedToolIds,
    toolGroups,
    callableAgentIds,
    selectedEdgeId,
    onRemoveToolAssignment,
    onToggleMcpTools,
    onToggleCallableAgents,
    isPublic,
    mcpServerConnectedIds,
  ]);

  // ─── Edge Delete Handler ───────────────────────────────────────────────────

  const onEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      for (const edge of deletedEdges) {
        if (edge.id === "edge-tools") {
          for (const toolId of localAssignedToolIds) onRemoveToolAssignment(toolId);
        } else if (edge.id === "edge-mcp-servers") {
          const toolIds = [...mcpServerConnectedIds.values()].flat();
          onToggleMcpTools(toolIds, false);
        } else if (edge.id === "edge-call-agents") {
          onToggleCallableAgents([...callableAgentIds], false);
        }
      }
    },
    [localAssignedToolIds, onRemoveToolAssignment, onToggleMcpTools, onToggleCallableAgents, mcpServerConnectedIds, callableAgentIds],
  );

  // ─── Connection / validation (mostly unused for modal cards) ──────────────

  const onConnect = useCallback((_connection: Connection) => {}, []);
  const isValidConnection = useCallback((_connection: Connection | Edge) => false, []);

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

type ToolToggleLike = {
  id: string;
  label: string;
  connected: boolean;
  sortOrder: number;
};

// ─── Exported Component (with ReactFlowProvider) ────────────────────────────

export function AgentFlowView(props: AgentFlowViewProps) {
  return (
    <ReactFlowProvider>
      <AgentFlowInner {...props} />
    </ReactFlowProvider>
  );
}

// ─── Agent Config Node ────────────────────────────────────────────────────────
// Central interactive node — replaces both config and current agent nodes.
// Contains: avatar, name, description, model picker, system prompt button.
// Receives edges from tools (right-top) and callable agents (right-bottom).

import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { Popover, Switch } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";

import { AvatarEditorPanel } from "src/components/AvatarEditorPanel";
import { ModelPicker } from "src/components/ModelPicker";
import { UserAvatar } from "src/components/UserAvatar";

export type AgentConfigNodeData = {
  name: string;
  description: string;
  avatar: string | null;
  selectedProviderId: string | null;
  aiModel: string;
  systemPrompt: string;
  onNameChange: (name: string) => void;
  onDescriptionChange: (desc: string) => void;
  onAvatarChange: (avatar: string) => void | Promise<void>;
  onModelChange: (providerId: string, model: string) => void;
  onOpenPrompt: () => void;
  isPublic: boolean;
  onTogglePublish: (checked: boolean) => void;
};

export type AgentConfigNodeType = Node<AgentConfigNodeData, "agentConfig">;

export function AgentConfigNode({ data }: NodeProps<AgentConfigNodeType>) {
  // Local state with debounced save for name & description
  const [localName, setLocalName] = useState(data.name);
  const [localDesc, setLocalDesc] = useState(data.description);
  const [localAvatar, setLocalAvatar] = useState(data.avatar);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const nameDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avatarDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync from parent
  useEffect(() => {
    setLocalName(data.name);
  }, [data.name]);

  useEffect(() => {
    setLocalDesc(data.description);
  }, [data.description]);

  useEffect(() => {
    setLocalAvatar(data.avatar);
  }, [data.avatar]);

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setLocalName(v);
      if (nameDebounce.current) clearTimeout(nameDebounce.current);
      nameDebounce.current = setTimeout(() => data.onNameChange(v), 600);
    },
    [data.onNameChange],
  );

  const handleDescChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const v = e.target.value;
      setLocalDesc(v);
      if (descDebounce.current) clearTimeout(descDebounce.current);
      descDebounce.current = setTimeout(() => data.onDescriptionChange(v), 600);
    },
    [data.onDescriptionChange],
  );

  const pendingAvatarRef = useRef<string | null>(null);

  const flushAvatarSave = useCallback(async () => {
    if (avatarDebounce.current) {
      clearTimeout(avatarDebounce.current);
      avatarDebounce.current = null;
    }
    const next = pendingAvatarRef.current;
    if (next == null) return;
    pendingAvatarRef.current = null;
    setAvatarSaving(true);
    try {
      await data.onAvatarChange(next);
    } finally {
      setAvatarSaving(false);
    }
  }, [data.onAvatarChange]);

  const handleAvatarDraftChange = useCallback(
    (next: string) => {
      setLocalAvatar(next);
      pendingAvatarRef.current = next;
      if (avatarDebounce.current) clearTimeout(avatarDebounce.current);
      avatarDebounce.current = setTimeout(() => {
        void flushAvatarSave();
      }, 400);
    },
    [flushAvatarSave],
  );

  useEffect(() => {
    return () => {
      if (avatarDebounce.current) clearTimeout(avatarDebounce.current);
    };
  }, []);

  const promptPreview = data.systemPrompt ? data.systemPrompt.slice(0, 80) + (data.systemPrompt.length > 80 ? "…" : "") : "No prompt defined";

  return (
    <div className="h-full flex flex-col rounded-md border border-border bg-card transition-all duration-200">
      {/* Handle — right top (receives edge from Tools group) */}
      <Handle
        type="target"
        id="tools"
        position={Position.Right}
        style={{ top: 40 }}
        className="!w-2 !h-2 !bg-primary/30 !border-2 !border-primary/50 transition-all duration-150 hover:!bg-primary hover:!border-primary hover:!w-3 hover:!h-3"
      />
      {/* Label for Tools handle */}
      <div style={{ position: "absolute", top: 40, right: 14, transform: "translateY(-50%)", pointerEvents: "none" }} className="flex items-center gap-1">
        <span className="text-2xs font-semibold uppercase tracking-wider text-primary bg-primary/5 px-1.5 py-0.5 rounded-full">Tools</span>
      </div>

      {/* Handle — right (receives edge from Call Agent group) */}
      <Handle
        type="target"
        id="agents"
        position={Position.Right}
        style={{ top: 76 }}
        className="!w-2 !h-2 !bg-edge-call-agent/30 !border-2 !border-edge-call-agent/50 transition-all duration-150 hover:!bg-edge-call-agent hover:!border-edge-call-agent hover:!w-3 hover:!h-3"
      />
      {/* Label for Call Agents handle */}
      <div style={{ position: "absolute", top: 76, right: 14, transform: "translateY(-50%)", pointerEvents: "none" }} className="flex items-center gap-1">
        <span className="text-2xs font-semibold uppercase tracking-wider text-chart-2 bg-chart-2/5 px-1.5 py-0.5 rounded-full">Agents</span>
      </div>

      {/* ── Avatar (click to edit; nodrag so React Flow doesn't steal pointer) ── */}
      <div className="flex flex-col items-center pt-5 pb-2 shrink-0">
        <div className="nodrag nopan">
          <Popover
            open={avatarOpen}
            onOpenChange={(open) => {
              setAvatarOpen(open);
              if (!open) void flushAvatarSave();
            }}
            trigger="click"
            placement="bottom"
            content={
              <div className="w-80 p-4">
                <AvatarEditorPanel avatar={localAvatar} name={localName || data.name} saving={avatarSaving} onChange={handleAvatarDraftChange} />
              </div>
            }
          >
            <button
              type="button"
              className="rounded-full ring-2 ring-transparent hover:ring-primary/30 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-primary/40"
              title="Edit avatar"
            >
              <UserAvatar avatar={localAvatar} name={localName || data.name} size={80} />
            </button>
          </Popover>
        </div>
      </div>

      <div className="px-4 pb-4 flex flex-col gap-3 flex-1 min-h-0 game-scrollbar">
        {/* ── Name ── */}
        <div className="flex flex-col gap-1 shrink-0">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Name</span>
          <div className="nodrag nopan">
            <input
              type="text"
              value={localName}
              onChange={handleNameChange}
              placeholder="Agent name"
              spellCheck={false}
              className="w-full h-8 px-2.5 rounded-md text-xs font-medium text-foreground bg-muted border border-border outline-none transition-colors duration-150 placeholder:text-muted-foreground focus:border-primary/30 hover:border-border"
            />
          </div>
        </div>

        {/* ── Description ── */}
        <div className="flex flex-col gap-1 shrink-0">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Description</span>
          <div className="nodrag nopan nowheel">
            <textarea
              value={localDesc}
              onChange={handleDescChange}
              placeholder="What does this agent do?"
              spellCheck={false}
              rows={3}
              className="w-full px-2.5 py-2 rounded-md text-xs text-muted-foreground bg-muted border border-border resize-none outline-none transition-colors duration-150 placeholder:text-muted-foreground focus:border-primary/30 hover:border-border leading-[1.5]"
            />
          </div>
        </div>

        {/* ── Model Picker ── */}
        <div className="flex flex-col gap-1 shrink-0">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Model</span>
          <div className="nodrag nopan nowheel">
            <ModelPicker selectedProviderId={data.selectedProviderId} selectedModel={data.aiModel} onChange={data.onModelChange} placeholder="Select model…" />
          </div>
        </div>

        {/* ── System Prompt (button → opens modal) ── */}
        <div className="flex flex-col gap-1 shrink-0">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">System Prompt</span>
          <div className="nodrag nopan">
            <button
              type="button"
              onClick={data.onOpenPrompt}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left bg-muted border border-border transition-all duration-150 cursor-pointer hover:border-primary/25 hover:bg-primary/5 group"
            >
              {/* Icon */}
              <div className="w-6 h-6 rounded-md bg-primary/8 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
                <svg
                  width={12}
                  height={12}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-primary opacity-60 group-hover:opacity-100 transition-opacity"
                >
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <line x1="10" y1="9" x2="8" y2="9" />
                </svg>
              </div>
              {/* Preview text */}
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-muted-foreground truncate leading-[1.4]">{promptPreview}</div>
              </div>
              {/* Arrow */}
              <svg
                width={12}
                height={12}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-muted-foreground shrink-0 group-hover:text-primary transition-colors"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Publish ── */}
        <div className="flex flex-col gap-1 shrink-0">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Publish</span>
          <div className="nodrag nopan">
            <div
              role="button"
              tabIndex={0}
              onClick={() => data.onTogglePublish(!data.isPublic)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  data.onTogglePublish(!data.isPublic);
                }
              }}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left border transition-all duration-150 cursor-pointer group ${
                data.isPublic ? "bg-chart-2/6 border-chart-2/20 hover:border-chart-2/35" : "bg-muted border-border hover:border-border"
              }`}
            >
              <svg
                width={12}
                height={12}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={data.isPublic ? "opacity-100 shrink-0 text-chart-2" : "opacity-40 shrink-0"}
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <div className="flex-1 min-w-0">
                <div className={`text-[11px] font-medium leading-[1.4] ${data.isPublic ? "text-chart-2" : "text-muted-foreground"}`}>
                  {data.isPublic ? "Public" : "Private"}
                </div>
                <div className="text-[10px] text-muted-foreground leading-[1.3] mt-0.5">
                  {data.isPublic ? "Anyone with the link can chat" : "Only you can access this agent"}
                </div>
              </div>
              <div onClick={(e) => e.stopPropagation()}>
                <Switch checked={data.isPublic} onChange={data.onTogglePublish} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Handle — bottom-left (connects to Publish node) */}
      {data.isPublic && (
        <Handle
          type="target"
          id="publish"
          position={Position.Left}
          style={{ top: "93%" }}
          className="!w-2 !h-2 !bg-edge-call-agent/30 !border-2 !border-edge-call-agent/50 transition-all duration-150"
        />
      )}
    </div>
  );
}

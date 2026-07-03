// ─── Agent Config Node ────────────────────────────────────────────────────────
// Central interactive node — replaces both config and current agent nodes.
// Contains: AppLogo, name, description, model picker, system prompt button.
// Receives edges from tools (right-top) and callable agents (right-bottom).

import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LlmProvider } from "src/common/types";
import { AppLogo } from "src/components/AppLogo";
import { ModelPicker } from "src/components/ui/model-picker";
import { Switch } from "src/components/ui/switch";

export type AgentConfigNodeData = {
  name: string;
  description: string;
  providers: LlmProvider[];
  providersLoaded: boolean;
  selectedProviderId: string | null;
  aiModel: string;
  systemPrompt: string;
  onNameChange: (name: string) => void;
  onDescriptionChange: (desc: string) => void;
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
  const nameDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync from parent
  useEffect(() => {
    setLocalName(data.name);
  }, [data.name]);

  useEffect(() => {
    setLocalDesc(data.description);
  }, [data.description]);

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

  const promptPreview = data.systemPrompt ? data.systemPrompt.slice(0, 80) + (data.systemPrompt.length > 80 ? "…" : "") : "No prompt defined";

  return (
    <div className="h-full flex flex-col rounded-xl border border-white/8 bg-surface shadow-[0_0_32px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.03)] transition-all duration-200">
      {/* Handle — left (receives edge from Chat node) */}
      <Handle
        type="target"
        id="chat"
        position={Position.Left}
        style={{ top: "50%" }}
        className="!w-2 !h-2 !bg-[rgba(168,255,83,0.15)] !border-2 !border-[rgba(168,255,83,0.25)] transition-all duration-150"
      />

      {/* Handle — right top (receives edge from Tools group) */}
      <Handle
        type="target"
        id="tools"
        position={Position.Right}
        style={{ top: 40 }}
        className="!w-2 !h-2 !bg-[rgba(168,255,83,0.3)] !border-2 !border-[rgba(168,255,83,0.5)] transition-all duration-150 hover:!bg-primary hover:!border-primary hover:!w-3 hover:!h-3"
      />
      {/* Label for Tools handle */}
      <div style={{ position: "absolute", top: 40, right: 14, transform: "translateY(-50%)", pointerEvents: "none" }} className="flex items-center gap-1">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-[#a8ff53]/50 bg-[rgba(168,255,83,0.05)] px-1.5 py-0.5 rounded-full">Tools</span>
      </div>

      {/* Handle — right (receives edge from Call Agent group) */}
      <Handle
        type="target"
        id="agents"
        position={Position.Right}
        style={{ top: 76 }}
        className="!w-2 !h-2 !bg-[rgba(156,154,242,0.3)] !border-2 !border-[rgba(156,154,242,0.5)] transition-all duration-150 hover:!bg-[#9c9af2] hover:!border-[#9c9af2] hover:!w-3 hover:!h-3"
      />
      {/* Label for Call Agents handle */}
      <div style={{ position: "absolute", top: 76, right: 14, transform: "translateY(-50%)", pointerEvents: "none" }} className="flex items-center gap-1">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-[#9c9af2]/50 bg-[rgba(156,154,242,0.05)] px-1.5 py-0.5 rounded-full">
          Agents
        </span>
      </div>

      {/* ── AppLogo (draggable area) ── */}
      <div className="flex flex-col items-center pt-5 pb-2 cursor-grab active:cursor-grabbing shrink-0">
        <AppLogo size={80} fill="#a8ff53" strokeWidth={0.7} />
      </div>

      <div className="px-4 pb-4 flex flex-col gap-3 flex-1 min-h-0 game-scrollbar">
        {/* ── Name ── */}
        <div className="flex flex-col gap-1 shrink-0">
          <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">Name</span>
          <div className="nodrag nopan">
            <input
              type="text"
              value={localName}
              onChange={handleNameChange}
              placeholder="Agent name"
              spellCheck={false}
              className="w-full h-8 px-2.5 rounded-md text-xs font-medium text-main bg-[rgba(255,255,255,0.02)] border border-white/6 outline-none transition-colors duration-150 placeholder:text-muted/40 focus:border-primary/30 hover:border-white/10"
            />
          </div>
        </div>

        {/* ── Description ── */}
        <div className="flex flex-col gap-1 shrink-0">
          <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">Description</span>
          <div className="nodrag nopan nowheel">
            <textarea
              value={localDesc}
              onChange={handleDescChange}
              placeholder="What does this agent do?"
              spellCheck={false}
              rows={3}
              className="w-full px-2.5 py-2 rounded-md text-xs text-soft bg-[rgba(255,255,255,0.02)] border border-white/6 resize-none outline-none transition-colors duration-150 placeholder:text-muted/40 focus:border-primary/30 hover:border-white/10 leading-[1.5]"
            />
          </div>
        </div>

        {/* ── Model Picker ── */}
        <div className="flex flex-col gap-1 shrink-0">
          <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">Model</span>
          <div className="nodrag nopan nowheel">
            <ModelPicker
              providers={data.providers}
              selectedProviderId={data.selectedProviderId}
              selectedModel={data.aiModel}
              onChange={data.onModelChange}
              loaded={data.providersLoaded}
              disabled={!data.providersLoaded}
              placeholder="Select model…"
            />
          </div>
        </div>

        {/* ── System Prompt (button → opens modal) ── */}
        <div className="flex flex-col gap-1 shrink-0">
          <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">System Prompt</span>
          <div className="nodrag nopan">
            <button
              type="button"
              onClick={data.onOpenPrompt}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left bg-[rgba(255,255,255,0.02)] border border-white/6 transition-all duration-150 cursor-pointer hover:border-primary/25 hover:bg-[rgba(168,255,83,0.02)] group"
            >
              {/* Icon */}
              <div className="w-6 h-6 rounded-md bg-primary/8 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
                <svg
                  width={12}
                  height={12}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#a8ff53"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="opacity-60 group-hover:opacity-100 transition-opacity"
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
                <div className="text-[11px] text-soft truncate leading-[1.4]">{promptPreview}</div>
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
                className="text-muted/40 shrink-0 group-hover:text-primary/60 transition-colors"
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
          <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">Publish</span>
          <div className="nodrag nopan">
            <button
              type="button"
              onClick={() => data.onTogglePublish(!data.isPublic)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left border transition-all duration-150 cursor-pointer group ${
                data.isPublic
                  ? "bg-[rgba(156,154,242,0.06)] border-[rgba(156,154,242,0.2)] hover:border-[rgba(156,154,242,0.35)]"
                  : "bg-[rgba(255,255,255,0.02)] border-white/6 hover:border-white/10"
              }`}
            >
              <svg
                width={12}
                height={12}
                viewBox="0 0 24 24"
                fill="none"
                stroke={data.isPublic ? "#9c9af2" : "currentColor"}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={data.isPublic ? "opacity-100 shrink-0" : "opacity-40 shrink-0"}
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <div className="flex-1 min-w-0">
                <div className={`text-[11px] font-medium leading-[1.4] ${data.isPublic ? "text-[#9c9af2]" : "text-soft"}`}>
                  {data.isPublic ? "Public" : "Private"}
                </div>
                <div className="text-[10px] text-muted leading-[1.3] mt-0.5">
                  {data.isPublic ? "Anyone with the link can chat" : "Only you can access this agent"}
                </div>
              </div>
              <div onClick={(e) => e.stopPropagation()}>
                <Switch checked={data.isPublic} onCheckedChange={data.onTogglePublish} />
              </div>
            </button>
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
          className="!w-2 !h-2 !bg-[rgba(156,154,242,0.3)] !border-2 !border-[rgba(156,154,242,0.5)] transition-all duration-150"
        />
      )}
    </div>
  );
}

import { AltArrowLeft } from "@solar-icons/react";
import { AppLogo } from "../../../../components/AppLogo";
import type { ConvMeta } from "./types";

interface ChatSidebarProps {
  agentName?: string;
  agentDescription?: string;
  agentModel?: string;
  toolCount?: number;
  conversations: ConvMeta[];
  conversationId: string | null;
  processingConvIds: Set<string>;
  sidebarOpen: boolean;
  running: boolean;
  onCloseSidebar: () => void;
  onNewConversation: () => void;
  onSwitchConversation: (convId: string) => void;
  onDeleteConversation: (convId: string) => void;
}

export function ChatSidebar({
  agentName,
  agentDescription,
  agentModel,
  toolCount,
  conversations,
  conversationId,
  processingConvIds,
  sidebarOpen,
  running,
  onCloseSidebar,
  onNewConversation,
  onSwitchConversation,
  onDeleteConversation,
}: ChatSidebarProps) {
  const modelName = agentModel ? agentModel.split("/").pop() : null;

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={onCloseSidebar} />}

      <aside
        className={`
          fixed md:relative z-40 md:z-auto
          flex flex-col h-full
          w-72 shrink-0
          bg-surface-raised/95 backdrop-blur-md
          border-r border-border
          transition-transform duration-300 ease-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0 md:w-0 md:border-0 md:overflow-hidden"}
        `}
      >
        {/* ── Agent Info Card ─────────────────────────────────── */}
        <div className="shrink-0 px-4 pt-5 pb-4 relative">
          {/* Close button (mobile) */}
          <button
            type="button"
            onClick={onCloseSidebar}
            className="md:hidden absolute top-4 right-3 text-muted hover:text-soft transition-colors p-1.5 rounded-lg hover:bg-white/5"
          >
            <AltArrowLeft size={16} />
          </button>

          {/* Icon + Name + Description (centered, stacked) */}
          <div className="flex flex-col items-center gap-2 mb-3">
            <div className="relative pt-1">
              <div className="absolute inset-0 rounded-lg bg-primary/15 blur-md scale-150" />
              <div className="relative">
                <AppLogo size={48} />
              </div>
            </div>
            <h1 className="font-display text-[16px] font-semibold text-main leading-tight text-center truncate max-w-full">{agentName}</h1>
          </div>

          {/* Description */}
          {agentDescription && <p className="text-[12px] text-muted leading-relaxed line-clamp-2 mb-3 text-center">{agentDescription}</p>}

          {/* Specs — label:value rows */}
          <div className="flex flex-col gap-2.5 pt-3 border-t border-border/20">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-medium text-muted shrink-0">Model</span>
              {modelName ? (
                <span className="text-[12px] font-medium text-muted truncate max-w-[140px]">{modelName}</span>
              ) : (
                <span className="text-[11px] text-muted/50 italic">—</span>
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-medium text-muted shrink-0">Tools</span>
              <span className="text-[12px] text-muted">
                {toolCount ?? 0} {(toolCount ?? 0) === 1 ? "tool" : "tools"}
              </span>
            </div>
          </div>
        </div>

        {/* Neon accent divider */}
        <div className="mx-4 h-px shrink-0" style={{ background: "linear-gradient(90deg, transparent, #A8FF5340, #9C9AF230, transparent)" }} />

        {/* New Chat button */}
        <div className="px-3 py-3 shrink-0">
          <button
            type="button"
            onClick={onNewConversation}
            disabled={running}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-border/40 text-muted text-[13px] font-medium hover:border-primary/30 hover:text-primary hover:bg-primary/6 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <title>New</title>
              <path d="M12 5v14M5 12h14" />
            </svg>
            New Chat
          </button>
        </div>

        {/* Divider */}
        <div className="mx-3 h-px bg-border/30 shrink-0" />

        {/* Conversation list */}
        <div className="flex-1 min-h-0 overflow-y-auto game-scrollbar px-2 pb-4 pt-2">
          {conversations.length === 0 ? (
            <p className="text-[12px] text-muted text-center py-4">No conversations yet</p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {conversations.map((conv) => {
                const isActive = conv.id === conversationId;
                const isProcessing = processingConvIds.has(conv.id);
                return (
                  <div
                    key={conv.id}
                    className="group relative flex items-center rounded-md transition-all"
                    style={{
                      backgroundColor: isActive ? "rgba(168, 255, 83, 0.08)" : undefined,
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.04)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    <button type="button" onClick={() => onSwitchConversation(conv.id)} className="flex-1 text-left pl-3 py-2.5 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <p
                          className="text-sm font-medium leading-snug truncate line-clamp-2 flex-1 min-w-0"
                          style={{
                            color: isActive ? "var(--color-on-surface, #F3F4F6)" : "var(--color-soft, #D7D9DD)",
                          }}
                        >
                          {conv.title}
                        </p>
                        {isProcessing && (
                          <span
                            className="shrink-0 inline-block rounded-full animate-spin"
                            style={{
                              width: 12,
                              height: 12,
                              border: "2px solid rgba(168, 255, 83, 0.2)",
                              borderTopColor: "var(--color-primary, #A8FF53)",
                            }}
                          />
                        )}
                      </div>
                    </button>
                    {/* Delete button — show on hover */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteConversation(conv.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 shrink-0 mr-2 p-1 rounded-lg text-muted hover:text-danger hover:bg-danger/10 transition-all"
                      title="Delete conversation"
                    >
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <title>Delete</title>
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14H6L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4h6v2" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

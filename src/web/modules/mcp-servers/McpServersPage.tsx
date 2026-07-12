// ─── MCP Servers Page ────────────────────────────────────────────────────────
// Route: /mcp-servers — List servers + synced tool catalog. Gear → config edit.

import { Bolt, RefreshCircle, Settings } from "@solar-icons/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "src/common/api";
import type { McpServer } from "src/common/types";
import RenderIf from "src/components/ui/RenderIf";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { fetchMcpServers } from "./common/mcpServersSlice";

export default function McpServersPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const servers = useAppSelector((s) => s.mcpServers.items) as McpServer[];

  const [error, setError] = useState("");
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    dispatch(fetchMcpServers());
  }, [dispatch]);

  const handleSync = async (id: string) => {
    setSyncingIds((prev) => new Set(prev).add(id));
    setError("");
    try {
      await apiClient.post(`/api/mcp-servers/${id}/sync`);
      dispatch(fetchMcpServers());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <div className="py-8 px-10">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-start justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-primary/10 text-primary">
              <Bolt width={22} height={22} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-main m-0 leading-tight">MCP Servers</h1>
              <p className="text-sm text-muted mt-1">
                Remote MCP tools for your agents
                <span className="inline-flex items-center ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary">
                  {servers.length}
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/mcp-servers/edit")}
            className="flex items-center justify-center w-10 h-10 rounded-full border border-border/60 bg-transparent text-muted cursor-pointer transition-all duration-150 hover:bg-primary/10 hover:text-primary hover:border-primary/30"
            title="Edit MCP config"
          >
            <Settings width={18} height={18} />
          </button>
        </div>

        <RenderIf condition={!!error}>
          <div className="mb-4 text-xs text-danger font-medium">{error}</div>
        </RenderIf>

        <RenderIf condition={servers.length === 0}>
          <div className="flex flex-col items-center justify-center py-20 px-5 rounded-lg border border-border/40">
            <div className="w-12 h-12 rounded-xl bg-surface-raised flex items-center justify-center mb-3">
              <Bolt width={20} height={20} className="text-muted" />
            </div>
            <p className="text-sm font-semibold text-main mb-1 m-0">No MCP servers</p>
            <p className="text-xs text-muted m-0 mb-4">Open config to add servers with Cursor-format JSON.</p>
            <button
              type="button"
              onClick={() => navigate("/mcp-servers/edit")}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-secondary text-sm font-medium cursor-pointer border-none hover:opacity-90 transition-opacity"
            >
              <Settings width={14} height={14} />
              Edit Config
            </button>
          </div>
        </RenderIf>

        <RenderIf condition={servers.length > 0}>
          <div className="flex flex-col gap-4">
            {servers.map((server) => {
              const tools = server.tools ?? [];
              return (
                <div key={server.id} className="rounded-lg border border-border/60 overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 bg-surface-raised/40 border-b border-border/40">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-main truncate">{server.name}</div>
                      <div className="text-[11px] text-muted font-mono truncate mt-0.5">{server.url}</div>
                    </div>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary shrink-0">
                      {tools.length} tool{tools.length !== 1 ? "s" : ""}
                    </span>
                    <button
                      type="button"
                      className={[
                        "flex items-center justify-center w-7 h-7 rounded-md border border-transparent bg-transparent text-muted cursor-pointer transition-all duration-150 hover:bg-primary/10 hover:text-primary hover:border-primary/20",
                        syncingIds.has(server.id) ? "animate-spin" : "",
                      ].join(" ")}
                      onClick={() => handleSync(server.id)}
                      title="Re-sync tools"
                    >
                      <RefreshCircle width={15} height={15} />
                    </button>
                  </div>

                  <RenderIf condition={tools.length === 0}>
                    <div className="px-4 py-6 text-center text-xs text-muted">No tools synced yet. Re-sync or edit config.</div>
                  </RenderIf>

                  <RenderIf condition={tools.length > 0}>
                    <div className="flex flex-wrap gap-1.5 px-4 py-3">
                      {tools.map((tool) => (
                        <span
                          key={tool.name}
                          title={tool.description || tool.name}
                          className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-surface-raised text-soft border border-border/50"
                        >
                          {tool.name}
                        </span>
                      ))}
                    </div>
                  </RenderIf>
                </div>
              );
            })}
          </div>
        </RenderIf>
      </div>
    </div>
  );
}

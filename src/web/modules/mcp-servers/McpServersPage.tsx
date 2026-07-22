import { Clipboard, ClipboardCheck, Magnifier, PlugCircle, RefreshCircle, Settings, Widget } from "@solar-icons/react";
import { Alert, Button, Drawer, Empty, Input, message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "src/common/api";
import { cn } from "src/common/lib/cn";
import type { McpServer } from "src/common/types";
import { PageShell } from "src/components/PageShell";
import RenderIf from "src/components/RenderIf";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { fetchMcpServers, updateMcpServer } from "./common/mcpServersSlice";
import { McpServerCard, getServerStatus, toolCountOf } from "./components/McpServerCard";

export default function McpServersPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const servers = useAppSelector((s) => s.mcpServers.items) as McpServer[];

  const [error, setError] = useState("");
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [toolQuery, setToolQuery] = useState("");
  const [copiedUrl, setCopiedUrl] = useState(false);

  useEffect(() => {
    dispatch(fetchMcpServers());
  }, [dispatch]);

  useEffect(() => {
    setToolQuery("");
    setCopiedUrl(false);
  }, [drawerId]);

  const drawerServer = servers.find((s) => s.id === drawerId) ?? null;
  const tools = drawerServer?.tools ?? [];
  const liveCount = useMemo(() => servers.filter((s) => getServerStatus(s) === "live").length, [servers]);

  const filteredTools = useMemo(() => {
    const q = toolQuery.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter((tool) => tool.name.toLowerCase().includes(q) || (tool.description ?? "").toLowerCase().includes(q));
  }, [tools, toolQuery]);

  const handleSync = async (id: string) => {
    setSyncingIds((prev) => new Set(prev).add(id));
    setError("");
    try {
      await apiClient.post(`/api/mcp-servers/${id}/sync`);
      message.success("Synced");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      dispatch(fetchMcpServers());
      setSyncingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    setTogglingIds((prev) => new Set(prev).add(id));
    setError("");
    try {
      await dispatch(updateMcpServer({ id, isActive })).unwrap();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      dispatch(fetchMcpServers());
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(true);
      message.success("Copied");
      window.setTimeout(() => setCopiedUrl(false), 1500);
    } catch {
      message.error("Copy failed");
    }
  };

  const drawerTone = drawerServer ? getServerStatus(drawerServer) : "off";

  return (
    <PageShell>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="m-0 text-xl font-semibold leading-tight text-foreground">MCP servers</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Remote tools your agents can call
            <RenderIf condition={servers.length > 0}>
              <span className="ml-2 inline-flex items-center rounded-full bg-edge-mcp/12 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-edge-mcp">
                {liveCount}/{servers.length} live
              </span>
            </RenderIf>
          </p>
        </div>
        <Button type="primary" icon={<Settings width={16} height={16} />} onClick={() => navigate("/mcp-servers/edit")}>
          Config
        </Button>
      </div>

      <RenderIf condition={!!error}>
        <Alert type="error" description={error} showIcon className="mb-4 border-destructive/30 bg-destructive/10" />
      </RenderIf>

      <RenderIf
        condition={servers.length > 0}
        fallback={
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-5 py-16">
            <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-edge-mcp/12 text-edge-mcp">
              <PlugCircle weight="BoldDuotone" width={28} height={28} />
            </div>
            <p className="mb-1 text-base font-semibold text-foreground">No servers yet</p>
            <p className="m-0 mb-5 max-w-sm text-center text-sm text-muted-foreground">Add an MCP endpoint in config to expose remote tools to your agents.</p>
            <Button type="primary" icon={<Settings width={16} height={16} />} onClick={() => navigate("/mcp-servers/edit")}>
              Config
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {servers.map((server, index) => (
            <McpServerCard
              key={server.id}
              server={server}
              index={index}
              toggling={togglingIds.has(server.id)}
              onOpen={() => setDrawerId(server.id)}
              onToggleActive={(checked) => handleToggleActive(server.id, checked)}
            />
          ))}
        </div>
      </RenderIf>

      <Drawer
        open={!!drawerServer}
        onClose={() => setDrawerId(null)}
        size={440}
        destroyOnHidden
        title={null}
        styles={{
          header: { display: "none" },
          body: { padding: 0, display: "flex", flexDirection: "column", height: "100%" },
        }}
      >
        <RenderIf value={drawerServer}>
          {(server) => (
            <div className="flex h-full min-h-0 flex-col">
              <div className="shrink-0 border-b border-border-subtle px-5 pb-4 pt-5">
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-xl",
                      drawerTone === "live" && "bg-edge-mcp/12 text-edge-mcp",
                      drawerTone === "error" && "bg-destructive/12 text-destructive",
                      drawerTone === "off" && "bg-muted text-muted-foreground",
                    )}
                  >
                    <PlugCircle weight="BoldDuotone" width={20} height={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="m-0 truncate text-lg font-semibold text-foreground">{server.name}</h2>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <p className="m-0 min-w-0 flex-1 truncate font-mono text-[11px] text-tertiary-foreground">{server.url}</p>
                      <button
                        type="button"
                        onClick={() => handleCopyUrl(server.url)}
                        className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none"
                        aria-label="Copy"
                      >
                        {copiedUrl ? <ClipboardCheck width={13} height={13} /> : <Clipboard width={13} height={13} />}
                      </button>
                    </div>
                  </div>
                  <Button
                    type="default"
                    size="small"
                    icon={<RefreshCircle width={14} height={14} className={syncingIds.has(server.id) ? "animate-spin" : ""} />}
                    loading={syncingIds.has(server.id)}
                    disabled={!server.isActive}
                    onClick={() => handleSync(server.id)}
                  >
                    Sync
                  </Button>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      drawerTone === "live" && "bg-edge-mcp/12 text-edge-mcp",
                      drawerTone === "error" && "bg-destructive/12 text-destructive",
                      drawerTone === "off" && "bg-muted text-muted-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        drawerTone === "live" && "bg-edge-mcp motion-safe:animate-pulse",
                        drawerTone === "error" && "bg-destructive",
                        drawerTone === "off" && "bg-muted-foreground/50",
                      )}
                    />
                    {drawerTone === "live" ? "Live" : drawerTone === "error" ? "Error" : "Off"}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground">
                    <Widget width={12} height={12} />
                    {toolCountOf(server)} tool{toolCountOf(server) === 1 ? "" : "s"}
                  </span>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 py-4">
                <RenderIf condition={!!server.lastSyncError && server.isActive}>
                  <Alert type="error" description={server.lastSyncError} showIcon className="border-destructive/30 bg-destructive/10" />
                </RenderIf>

                <RenderIf condition={tools.length > 0}>
                  <Input
                    prefix={<Magnifier width={13} height={13} className="text-muted-foreground" />}
                    value={toolQuery}
                    onChange={(e) => setToolQuery(e.target.value)}
                    placeholder="Find tools…"
                    className="!h-8 text-sm"
                    allowClear
                  />
                </RenderIf>

                <RenderIf
                  condition={tools.length === 0}
                  fallback={
                    <RenderIf
                      condition={filteredTools.length === 0}
                      fallback={
                        <ul className="game-scrollbar m-0 flex min-h-0 flex-1 list-none flex-col gap-1.5 overflow-y-auto p-0">
                          {filteredTools.map((tool) => (
                            <li
                              key={tool.name}
                              className="rounded-xl border border-border-subtle bg-card/60 px-3.5 py-3 transition-colors hover:border-edge-mcp/25 hover:bg-edge-mcp/5"
                            >
                              <div className="truncate font-mono text-[13px] font-medium text-foreground">{tool.name}</div>
                              <RenderIf condition={!!tool.description?.trim()}>
                                <div className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-tertiary-foreground">{tool.description}</div>
                              </RenderIf>
                            </li>
                          ))}
                        </ul>
                      }
                    >
                      <Empty
                        className="py-10"
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={<span className="text-sm text-muted-foreground">No matching tools</span>}
                      />
                    </RenderIf>
                  }
                >
                  <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
                    <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                      <Widget width={18} height={18} />
                    </div>
                    <p className="m-0 text-sm font-medium text-foreground">No tools yet</p>
                    <p className="mt-1 m-0 text-xs text-muted-foreground">Sync this server to pull its tool catalog.</p>
                  </div>
                </RenderIf>
              </div>
            </div>
          )}
        </RenderIf>
      </Drawer>
    </PageShell>
  );
}

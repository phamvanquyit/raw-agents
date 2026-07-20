// ─── MCP Servers Page ────────────────────────────────────────────────────────
// Route: /mcp-servers — Endpoint inspector: pick a server, browse its tool catalog.

import { InfoCircle, Magnifier, PlugCircle, RefreshCircle, Settings, Widget } from "@solar-icons/react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "src/common/api";
import { cn } from "src/common/lib/cn";
import type { McpServer } from "src/common/types";
import { PageShell } from "src/components/PageShell";
import RenderIf from "src/components/ui/RenderIf";
import { Alert, AlertDescription } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "src/components/ui/empty";
import { Input } from "src/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "src/components/ui/popover";
import { Switch } from "src/components/ui/switch";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { fetchMcpServers, updateMcpServer } from "./common/mcpServersSlice";

type StatusTone = "live" | "off" | "error";

function getServerStatus(server: McpServer): { label: string; tone: StatusTone } {
  if (!server.isActive) return { label: "Off", tone: "off" };
  if (server.lastSyncError) return { label: "Error", tone: "error" };
  return { label: "Live", tone: "live" };
}

function StatusLed({ tone, className }: { tone: StatusTone; className?: string }) {
  return (
    <span
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full",
        tone === "live" && "bg-edge-mcp motion-safe:animate-pulse",
        tone === "error" && "bg-destructive",
        tone === "off" && "bg-muted-foreground/45",
        className,
      )}
      aria-hidden
    />
  );
}

function formatSyncedAt(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toolCountOf(server: McpServer): number {
  return server.tools?.length ?? server.toolCount ?? 0;
}

export default function McpServersPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const servers = useAppSelector((s) => s.mcpServers.items) as McpServer[];

  const [error, setError] = useState("");
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toolQuery, setToolQuery] = useState("");

  useEffect(() => {
    dispatch(fetchMcpServers());
  }, [dispatch]);

  useEffect(() => {
    if (servers.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !servers.some((s) => s.id === selectedId)) {
      setSelectedId(servers[0].id);
    }
  }, [servers, selectedId]);

  useEffect(() => {
    setToolQuery("");
  }, [selectedId]);

  const selected = servers.find((s) => s.id === selectedId) ?? servers[0] ?? null;
  const tools = selected?.tools ?? [];
  const toolCount = tools.length || selected?.toolCount || 0;

  const statusSummary = useMemo(() => {
    let live = 0;
    let off = 0;
    let errorCount = 0;
    for (const server of servers) {
      const tone = getServerStatus(server).tone;
      if (tone === "live") live += 1;
      else if (tone === "error") errorCount += 1;
      else off += 1;
    }
    return { live, off, error: errorCount };
  }, [servers]);

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

  return (
    <PageShell className="flex h-full min-h-0 flex-col overflow-hidden py-6" contentClassName="flex flex-1 min-h-0 flex-col">
      <div className="mb-5 flex shrink-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="m-0 text-xl font-semibold leading-tight text-foreground">MCP Servers</h1>
          <p className="m-0 mt-1.5 text-sm text-muted-foreground">
            Connect remote tool endpoints, then wire them into agents
            <RenderIf condition={servers.length > 0}>
              <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary tabular-nums">
                {servers.length}
              </span>
            </RenderIf>
          </p>
        </div>
        <Button variant="primary" size="md" icon={<Settings width={16} height={16} />} onClick={() => navigate("/mcp-servers/edit")}>
          Edit config
        </Button>
      </div>

      <RenderIf condition={servers.length > 0}>
        <div className="mb-4 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <StatusLed tone="live" />
            <span className="tabular-nums text-foreground">{statusSummary.live}</span> live
          </span>
          <RenderIf condition={statusSummary.off > 0}>
            <span className="inline-flex items-center gap-1.5">
              <StatusLed tone="off" />
              <span className="tabular-nums text-foreground">{statusSummary.off}</span> off
            </span>
          </RenderIf>
          <RenderIf condition={statusSummary.error > 0}>
            <span className="inline-flex items-center gap-1.5 text-destructive">
              <StatusLed tone="error" />
              <span className="tabular-nums">{statusSummary.error}</span> error
            </span>
          </RenderIf>
        </div>
      </RenderIf>

      <RenderIf condition={!!error}>
        <Alert variant="destructive" className="mb-4 shrink-0 border-destructive/30 bg-destructive/10">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </RenderIf>

      <RenderIf condition={servers.length === 0}>
        <Empty className="flex-1 border border-dashed border-border-subtle bg-card/40">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="bg-edge-mcp/12 text-edge-mcp [&_svg]:text-edge-mcp">
              <PlugCircle weight="BoldDuotone" width={22} height={22} />
            </EmptyMedia>
            <EmptyTitle className="text-base font-semibold">No servers yet</EmptyTitle>
            <EmptyDescription>Add servers in Cursor-format JSON, then Save & sync to pull tools.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="primary" size="md" icon={<Settings width={16} height={16} />} onClick={() => navigate("/mcp-servers/edit")}>
              Edit config
            </Button>
          </EmptyContent>
        </Empty>
      </RenderIf>

      <RenderIf condition={servers.length > 0}>
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-xl border border-border-subtle bg-card lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="flex max-h-48 min-h-0 flex-col border-b border-border-subtle lg:max-h-none lg:border-b-0 lg:border-r">
            <div className="flex shrink-0 items-center justify-between px-4 py-3">
              <span className="text-xs font-medium text-muted-foreground">Servers</span>
              <span className="text-xs tabular-nums text-tertiary-foreground">{servers.length}</span>
            </div>
            <nav className="game-scrollbar flex min-h-0 flex-1 gap-0.5 overflow-x-auto overflow-y-hidden px-2 pb-2 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto">
              {servers.map((server) => {
                const count = toolCountOf(server);
                const active = server.id === (selectedId ?? selected?.id);
                const status = getServerStatus(server);
                return (
                  <button
                    key={server.id}
                    type="button"
                    onClick={() => setSelectedId(server.id)}
                    className={cn(
                      "relative flex shrink-0 flex-col gap-1 rounded-md px-3 py-2.5 text-left transition-colors duration-150 lg:w-full",
                      "cursor-pointer outline-none focus-visible:outline-none",
                      active ? "bg-edge-mcp/10 text-foreground" : "bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    <span
                      className={cn("absolute inset-y-2 left-0 w-0.5 rounded-full transition-opacity", active ? "bg-edge-mcp opacity-100" : "opacity-0")}
                      aria-hidden
                    />
                    <span className="flex items-center gap-2 truncate text-[13px] font-medium">
                      <StatusLed tone={status.tone} />
                      <span className="truncate">{server.name}</span>
                    </span>
                    <span className="pl-3.5 text-[11px] tabular-nums text-tertiary-foreground">
                      {count} tool{count === 1 ? "" : "s"}
                    </span>
                  </button>
                );
              })}
            </nav>
          </aside>

          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            <RenderIf value={selected}>
              {(server) => {
                const status = getServerStatus(server);
                const syncing = syncingIds.has(server.id);
                const toggling = togglingIds.has(server.id);
                const syncedLabel = formatSyncedAt(server.lastSyncedAt);

                return (
                  <>
                    <header className="flex shrink-0 flex-col gap-4 border-b border-border-subtle px-5 py-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-edge-mcp/12 text-edge-mcp">
                              <PlugCircle weight="BoldDuotone" width={16} height={16} />
                            </div>
                            <h2 className="m-0 truncate text-base font-semibold text-foreground">{server.name}</h2>
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium",
                                status.tone === "live" && "bg-edge-mcp/12 text-edge-mcp",
                                status.tone === "error" && "bg-destructive/10 text-destructive",
                                status.tone === "off" && "bg-muted text-muted-foreground",
                              )}
                            >
                              <StatusLed tone={status.tone} className={status.tone === "live" ? "motion-safe:animate-none" : undefined} />
                              {status.label}
                            </span>
                          </div>
                          <RenderIf condition={!!syncedLabel}>
                            <p className="mt-2 mb-0 text-xs text-tertiary-foreground">Synced {syncedLabel}</p>
                          </RenderIf>
                        </div>

                        <div className="flex shrink-0 items-center gap-3 self-start">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{server.isActive ? "On" : "Off"}</span>
                            <Switch
                              checked={server.isActive}
                              disabled={toggling}
                              onCheckedChange={(checked) => handleToggleActive(server.id, checked)}
                              aria-label={server.isActive ? "Disable server" : "Enable server"}
                            />
                          </div>
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={<RefreshCircle width={14} height={14} className={syncing ? "animate-spin" : ""} />}
                            loading={syncing}
                            disabled={!server.isActive}
                            onClick={() => handleSync(server.id)}
                          >
                            {syncing ? "Syncing…" : "Sync"}
                          </Button>
                        </div>
                      </div>

                      <div className="relative overflow-hidden rounded-md border border-border bg-background">
                        <div className="absolute inset-y-0 left-0 w-0.5 bg-edge-mcp" aria-hidden />
                        <div className="flex items-start gap-3 py-2.5 pr-3 pl-3.5">
                          <span className="mt-0.5 shrink-0 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-edge-mcp">endpoint</span>
                          <p className="m-0 min-w-0 flex-1 break-all font-mono text-[12px] leading-relaxed text-foreground/90">{server.url}</p>
                        </div>
                      </div>

                      <RenderIf condition={!!server.lastSyncError && server.isActive}>
                        <Alert variant="destructive" className="border-destructive/30 bg-destructive/10">
                          <AlertDescription className="text-xs">{server.lastSyncError}</AlertDescription>
                        </Alert>
                      </RenderIf>
                    </header>

                    <div className="flex shrink-0 flex-col gap-3 px-5 pt-4 pb-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2">
                        <Widget width={14} height={14} className="text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground">Tool catalog</span>
                        <span className="text-xs tabular-nums text-tertiary-foreground">{toolCount}</span>
                      </div>
                      <RenderIf condition={tools.length > 0}>
                        <div className="relative w-full sm:w-[220px]">
                          <Magnifier
                            width={14}
                            height={14}
                            className="pointer-events-none absolute left-2.5 top-1/2 z-[1] -translate-y-1/2 text-muted-foreground"
                          />
                          <Input value={toolQuery} onChange={(e) => setToolQuery(e.target.value)} placeholder="Filter tools…" className="h-7 pl-8 text-sm" />
                        </div>
                      </RenderIf>
                    </div>

                    <RenderIf
                      condition={tools.length === 0}
                      fallback={
                        <RenderIf
                          condition={filteredTools.length === 0}
                          fallback={
                            <ul className="game-scrollbar m-0 flex min-h-0 flex-1 list-none flex-col gap-px overflow-y-auto px-3 pb-3">
                              {filteredTools.map((tool) => (
                                <li key={tool.name} className="group flex items-center gap-3 rounded-md px-2.5 py-2 transition-colors hover:bg-muted/40">
                                  <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground">{tool.name}</span>
                                  <RenderIf condition={!!tool.description}>
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <button
                                          type="button"
                                          className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md bg-transparent text-muted-foreground opacity-60 transition-all hover:bg-muted hover:text-foreground hover:opacity-100 focus-visible:outline-none group-hover:opacity-100"
                                          aria-label={`About ${tool.name}`}
                                        >
                                          <InfoCircle width={15} height={15} />
                                        </button>
                                      </PopoverTrigger>
                                      <PopoverContent align="end" side="left" sideOffset={8} className="w-80 p-3.5">
                                        <p className="m-0 mb-1.5 font-mono text-[12px] font-medium text-foreground">{tool.name}</p>
                                        <p className="m-0 text-[12px] leading-relaxed text-muted-foreground">{tool.description}</p>
                                      </PopoverContent>
                                    </Popover>
                                  </RenderIf>
                                </li>
                              ))}
                            </ul>
                          }
                        >
                          <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
                            <p className="m-0 text-sm text-muted-foreground">No tools match “{toolQuery.trim()}”</p>
                          </div>
                        </RenderIf>
                      }
                    >
                      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
                        <p className="m-0 mb-1 text-sm font-medium text-foreground">No tools synced</p>
                        <p className="m-0 text-xs text-muted-foreground">Sync this server, or check the URL in config.</p>
                      </div>
                    </RenderIf>
                  </>
                );
              }}
            </RenderIf>
          </section>
        </div>
      </RenderIf>
    </PageShell>
  );
}

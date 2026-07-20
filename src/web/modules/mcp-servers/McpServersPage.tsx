// ─── MCP Servers Page ────────────────────────────────────────────────────────
// Route: /mcp-servers — Table of servers; tools open in a drawer.

import { Clipboard, ClipboardCheck, Magnifier, PlugCircle, RefreshCircle, Settings } from "@solar-icons/react";
import { Alert, Button, Drawer, Empty, Input, Switch, Table, Tooltip, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "src/common/api";
import { cn } from "src/common/lib/cn";
import type { McpServer } from "src/common/types";
import { PageShell } from "src/components/PageShell";
import RenderIf from "src/components/RenderIf";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { fetchMcpServers, updateMcpServer } from "./common/mcpServersSlice";

type StatusTone = "live" | "off" | "error";

function getServerStatus(server: McpServer): StatusTone {
  if (!server.isActive) return "off";
  if (server.lastSyncError) return "error";
  return "live";
}

function toolCountOf(server: McpServer): number {
  return server.tools?.length ?? server.toolCount ?? 0;
}

function StatusLed({ tone }: { tone: StatusTone }) {
  return (
    <span
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        tone === "live" && "bg-edge-mcp motion-safe:animate-pulse",
        tone === "error" && "bg-destructive",
        tone === "off" && "bg-muted-foreground/40",
      )}
      aria-hidden
    />
  );
}

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

  const columns: ColumnsType<McpServer> = [
    {
      title: "Server",
      key: "server",
      render: (_, server) => {
        const tone = getServerStatus(server);
        const led = <StatusLed tone={tone} />;
        return (
          <div className="flex min-w-0 items-center gap-2.5">
            <RenderIf condition={tone === "error" && !!server.lastSyncError} fallback={led}>
              <Tooltip title={server.lastSyncError}>
                <span className="inline-flex">{led}</span>
              </Tooltip>
            </RenderIf>
            <span className="truncate text-sm font-medium text-foreground">{server.name}</span>
          </div>
        );
      },
    },
    {
      title: "Endpoint",
      dataIndex: "url",
      key: "url",
      ellipsis: true,
      render: (url: string) => <span className="font-mono text-[12px] text-tertiary-foreground">{url}</span>,
    },
    {
      title: "Tools",
      key: "tools",
      width: 88,
      render: (_, server) => <span className="tabular-nums text-sm text-muted-foreground">{toolCountOf(server)}</span>,
    },
    {
      title: "",
      key: "active",
      width: 64,
      align: "center",
      onCell: () => ({ onClick: (e: React.MouseEvent) => e.stopPropagation() }),
      render: (_, server) => (
        <Switch
          size="small"
          checked={server.isActive}
          disabled={togglingIds.has(server.id)}
          onChange={(checked) => handleToggleActive(server.id, checked)}
          aria-label={server.isActive ? "Disable" : "Enable"}
        />
      ),
    },
  ];

  return (
    <PageShell>
      <div className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-2.5">
          <h1 className="m-0 text-xl font-semibold text-foreground">MCP</h1>
          <RenderIf condition={servers.length > 0}>
            <span className="text-xs tabular-nums text-tertiary-foreground">{servers.length}</span>
          </RenderIf>
        </div>
        <Button type="primary" icon={<Settings width={16} height={16} />} onClick={() => navigate("/mcp-servers/edit")}>
          Config
        </Button>
      </div>

      <RenderIf condition={!!error}>
        <Alert type="error" description={error} showIcon className="mb-4 border-destructive/30 bg-destructive/10" />
      </RenderIf>

      <Table<McpServer>
        rowKey="id"
        columns={columns}
        dataSource={servers}
        pagination={false}
        onRow={(server) => ({
          onClick: () => setDrawerId(server.id),
          className: "cursor-pointer",
        })}
        locale={{
          emptyText: (
            <Empty
              className="py-8"
              image={
                <div className="flex size-10 items-center justify-center rounded-lg bg-edge-mcp/12 text-edge-mcp [&_svg]:text-edge-mcp">
                  <PlugCircle weight="BoldDuotone" width={22} height={22} />
                </div>
              }
              description={<span className="text-sm text-muted-foreground">No servers</span>}
            >
              <Button type="primary" size="small" icon={<Settings width={14} height={14} />} onClick={() => navigate("/mcp-servers/edit")}>
                Config
              </Button>
            </Empty>
          ),
        }}
      />

      <Drawer
        open={!!drawerServer}
        onClose={() => setDrawerId(null)}
        title={drawerServer?.name ?? ""}
        width={420}
        destroyOnHidden
        extra={
          drawerServer ? (
            <Button
              type="default"
              size="small"
              icon={<RefreshCircle width={14} height={14} className={syncingIds.has(drawerServer.id) ? "animate-spin" : ""} />}
              loading={syncingIds.has(drawerServer.id)}
              disabled={!drawerServer.isActive}
              onClick={() => handleSync(drawerServer.id)}
            >
              Sync
            </Button>
          ) : null
        }
      >
        <RenderIf value={drawerServer}>
          {(server) => (
            <div className="flex h-full flex-col gap-3">
              <div className="flex items-center gap-2">
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

              <RenderIf condition={!!server.lastSyncError && server.isActive}>
                <Alert type="error" description={server.lastSyncError} showIcon className="border-destructive/30 bg-destructive/10" />
              </RenderIf>

              <RenderIf condition={tools.length > 0}>
                <Input
                  prefix={<Magnifier width={13} height={13} className="text-muted-foreground" />}
                  value={toolQuery}
                  onChange={(e) => setToolQuery(e.target.value)}
                  placeholder="Find…"
                  className="!h-8 text-sm"
                />
              </RenderIf>

              <RenderIf
                condition={tools.length === 0}
                fallback={
                  <RenderIf
                    condition={filteredTools.length === 0}
                    fallback={
                      <ul className="game-scrollbar m-0 flex min-h-0 flex-1 list-none flex-col gap-0.5 overflow-y-auto p-0">
                        {filteredTools.map((tool) => (
                          <li key={tool.name} className="rounded-md px-2.5 py-2 transition-colors hover:bg-muted/40">
                            <div className="truncate font-mono text-[13px] text-foreground">{tool.name}</div>
                            <RenderIf condition={!!tool.description?.trim()}>
                              <div className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-tertiary-foreground">{tool.description}</div>
                            </RenderIf>
                          </li>
                        ))}
                      </ul>
                    }
                  >
                    <p className="m-0 py-8 text-center text-xs text-tertiary-foreground">No match</p>
                  </RenderIf>
                }
              >
                <p className="m-0 py-8 text-center text-xs text-tertiary-foreground">Empty — sync to pull tools</p>
              </RenderIf>
            </div>
          )}
        </RenderIf>
      </Drawer>
    </PageShell>
  );
}

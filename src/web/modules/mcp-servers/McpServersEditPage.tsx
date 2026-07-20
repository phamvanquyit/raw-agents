// ─── MCP Servers Config Edit ─────────────────────────────────────────────────
// Route: /mcp-servers/edit — Full-page Cursor-format JSON config editor.

import { AltArrowLeft, Diskette, PlugCircle } from "@solar-icons/react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "src/common/api";
import { MonacoEditor } from "src/components/ui/MonacoEditor";
import RenderIf from "src/components/ui/RenderIf";
import { Button } from "src/components/ui/button";
import { useAppDispatch } from "src/store/store";
import { fetchMcpServers } from "./common/mcpServersSlice";

const MCP_COPPER = "var(--edge-mcp)";
const EMPTY_CONFIG = `{\n  "mcpServers": {}\n}`;

type McpConfig = {
  mcpServers: Record<string, { url: string; headers?: Record<string, string> }>;
};

type ParsedPreview = {
  servers: { name: string; url: string }[];
  error: string | null;
};

function configToJson(config: McpConfig): string {
  return JSON.stringify(config, null, 2);
}

function parsePreview(jsonText: string): ParsedPreview {
  try {
    const parsed = JSON.parse(jsonText) as { mcpServers?: unknown };
    if (!parsed || typeof parsed !== "object" || !parsed.mcpServers || typeof parsed.mcpServers !== "object" || Array.isArray(parsed.mcpServers)) {
      return { servers: [], error: 'Root must include "mcpServers" as an object' };
    }
    const servers = Object.entries(parsed.mcpServers as Record<string, { url?: unknown }>).map(([name, value]) => ({
      name,
      url: typeof value?.url === "string" ? value.url : "",
    }));
    return { servers, error: null };
  } catch {
    return { servers: [], error: "Invalid JSON" };
  }
}

export default function McpServersEditPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const [jsonText, setJsonText] = useState(EMPTY_CONFIG);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [syncMessage, setSyncMessage] = useState("");

  const preview = useMemo(() => parsePreview(jsonText), [jsonText]);

  const loadConfig = async () => {
    setLoading(true);
    setError("");
    try {
      const config = await apiClient.get<McpConfig>("/api/mcp-servers/config");
      setJsonText(configToJson(config));
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setJsonText(EMPTY_CONFIG);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleJsonChange = (value: string | undefined) => {
    setJsonText(value ?? "");
    setDirty(true);
    setError("");
    setSyncMessage("");
  };

  const handleSaveAndSync = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setError("Fix the JSON before saving — it must be valid.");
      return;
    }

    setSaving(true);
    setError("");
    setSyncMessage("");
    try {
      const result = await apiClient.put<{
        created: string[];
        updated: string[];
        deleted: string[];
        syncErrors: { name: string; error: string }[];
      }>("/api/mcp-servers/config", parsed);

      await loadConfig();
      dispatch(fetchMcpServers());

      const parts: string[] = [];
      if (result.created?.length) parts.push(`added ${result.created.length}`);
      if (result.updated?.length) parts.push(`updated ${result.updated.length}`);
      if (result.deleted?.length) parts.push(`removed ${result.deleted.length}`);
      if (result.syncErrors?.length) {
        setError(result.syncErrors.map((e) => `${e.name}: ${e.error}`).join("; "));
      }
      setSyncMessage(parts.length > 0 ? `Synced — ${parts.join(", ")}` : "Synced — no changes");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-border bg-card px-4">
        <button
          type="button"
          onClick={() => navigate("/mcp-servers")}
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-transparent text-muted-foreground transition-all duration-150 hover:border-border hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          title="Back to MCP Servers"
          aria-label="Back to MCP Servers"
        >
          <AltArrowLeft width={16} height={16} />
        </button>

        <div className="h-5 w-px shrink-0 bg-border" />

        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div className="min-w-0">
            <h1 className="m-0 truncate text-[14px] font-semibold leading-tight text-foreground">Server config</h1>
            <p className="m-0 truncate text-[11px] text-muted-foreground">Paste Cursor-format JSON · Save syncs servers & tools</p>
          </div>
          <RenderIf condition={dirty}>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-[10px] font-semibold text-primary">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              Unsaved
            </span>
          </RenderIf>
        </div>

        <Button
          variant="primary"
          size="sm"
          icon={<Diskette width={14} height={14} />}
          loading={saving}
          disabled={(!dirty && !saving) || loading || !!preview.error}
          onClick={handleSaveAndSync}
        >
          {saving ? "Syncing…" : "Save & sync"}
        </Button>
      </header>

      <RenderIf condition={!!error}>
        <div className="shrink-0 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs font-medium text-destructive">{error}</div>
      </RenderIf>
      <RenderIf condition={!!syncMessage && !error}>
        <div className="shrink-0 border-b border-border/60 bg-edge-mcp/8 px-4 py-2 text-xs font-medium text-edge-mcp">{syncMessage}</div>
      </RenderIf>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section
          className="relative flex min-h-0 min-w-0 flex-col border-b border-border lg:border-b-0 lg:border-r"
          style={{ backgroundColor: "var(--muted)" }}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border/40 px-4 py-2">
            <span className="text-[11px] font-medium text-muted-foreground">mcp.json</span>
            <span className="text-[11px] text-muted-foreground">{loading ? "Loading…" : "⌘S to save"}</span>
          </div>
          <div className="min-h-0 flex-1">
            <MonacoEditor
              language="json"
              value={loading ? EMPTY_CONFIG : jsonText}
              onChange={handleJsonChange}
              onSave={handleSaveAndSync}
              height="100%"
              options={{
                fontFamily: "var(--font-family-mono)",
                fontSize: 13,
                lineNumbers: "on",
                folding: true,
                renderLineHighlight: "line",
                readOnly: loading,
                padding: { top: 12, bottom: 16 },
              }}
            />
          </div>
        </section>

        <aside className="flex min-h-0 flex-col overflow-hidden bg-card">
          <div className="shrink-0 border-b border-border px-4 py-3">
            <p className="m-0 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">In this file</p>
            <p className="m-0 mt-1 text-[13px] font-medium text-foreground">
              <RenderIf condition={!!preview.error} fallback={`${preview.servers.length} server${preview.servers.length === 1 ? "" : "s"}`}>
                Can&apos;t read file
              </RenderIf>
            </p>
          </div>

          <div className="game-scrollbar min-h-0 flex-1 overflow-y-auto">
            <RenderIf condition={!!preview.error}>
              <div className="px-4 py-4">
                <p className="m-0 text-[12px] leading-relaxed text-destructive">{preview.error}</p>
                <p className="m-0 mt-2 text-[12px] leading-relaxed text-muted-foreground">Fix the JSON on the left, then Save & sync.</p>
              </div>
            </RenderIf>

            <RenderIf condition={!preview.error && preview.servers.length === 0}>
              <div className="flex flex-col items-center px-4 py-10 text-center">
                <div
                  className="mb-3 flex h-10 w-10 items-center justify-center rounded-md"
                  style={{ background: "color-mix(in srgb, var(--edge-mcp) 12%, transparent)", color: MCP_COPPER }}
                >
                  <PlugCircle weight="BoldDuotone" width={18} height={18} />
                </div>
                <p className="m-0 text-[13px] font-medium text-foreground">No servers yet</p>
                <p className="m-0 mt-1.5 max-w-[200px] text-[12px] leading-relaxed text-muted-foreground">Add entries under mcpServers, then Save & sync.</p>
              </div>
            </RenderIf>

            <RenderIf condition={!preview.error && preview.servers.length > 0}>
              <ul className="m-0 list-none divide-y divide-border/40 p-0">
                {preview.servers.map((server) => (
                  <li key={server.name} className="px-4 py-3">
                    <div className="flex items-start gap-2.5">
                      <div
                        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                        style={{ background: "color-mix(in srgb, var(--edge-mcp) 12%, transparent)", color: MCP_COPPER }}
                      >
                        <PlugCircle weight="BoldDuotone" width={12} height={12} />
                      </div>
                      <div className="min-w-0">
                        <p className="m-0 truncate text-[13px] font-semibold text-foreground">{server.name}</p>
                        <p className="m-0 mt-0.5 break-all text-[11px] leading-relaxed text-muted-foreground">{server.url || "Missing url"}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </RenderIf>
          </div>

          <div className="shrink-0 border-t border-border px-4 py-3">
            <p className="m-0 mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">How it works</p>
            <ol className="m-0 list-none space-y-2 p-0">
              {["Edit the JSON on the left", "Click Save & sync", "Servers & tools show on the list page"].map((step, i) => (
                <li key={step} className="flex gap-2.5 text-[12px] leading-snug text-muted-foreground">
                  <span className="w-4 shrink-0 text-muted-foreground">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <pre className="mt-3 mb-0 overflow-x-auto rounded-md border border-border bg-background px-2.5 py-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
              {`{
  "mcpServers": {
    "my-server": {
      "url": "https://…"
    }
  }
}`}
            </pre>
          </div>
        </aside>
      </div>
    </div>
  );
}

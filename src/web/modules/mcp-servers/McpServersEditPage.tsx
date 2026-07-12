// ─── MCP Servers Config Edit ─────────────────────────────────────────────────
// Route: /mcp-servers/edit — Cursor-format JSON config editor.

import { AltArrowLeft, Diskette } from "@solar-icons/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "src/common/api";
import { MonacoEditor } from "src/components/ui/MonacoEditor";
import RenderIf from "src/components/ui/RenderIf";
import { Button } from "src/components/ui/button";
import { useAppDispatch } from "src/store/store";
import { fetchMcpServers } from "./common/mcpServersSlice";

const EMPTY_CONFIG = `{\n  "mcpServers": {}\n}`;

type McpConfig = {
  mcpServers: Record<string, { url: string; headers?: Record<string, string> }>;
};

function configToJson(config: McpConfig): string {
  return JSON.stringify(config, null, 2);
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

  const handleApply = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setError("Invalid JSON");
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
      if (result.created?.length) parts.push(`created ${result.created.length}`);
      if (result.updated?.length) parts.push(`updated ${result.updated.length}`);
      if (result.deleted?.length) parts.push(`removed ${result.deleted.length}`);
      if (result.syncErrors?.length) {
        setError(result.syncErrors.map((e) => `${e.name}: ${e.error}`).join("; "));
      }
      setSyncMessage(parts.length > 0 ? `Applied — ${parts.join(", ")}` : "Applied");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="py-8 px-10">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/mcp-servers")}
              className="flex items-center justify-center w-9 h-9 rounded-lg bg-transparent border border-transparent hover:bg-surface-raised hover:border-border text-muted hover:text-main transition-all duration-150 cursor-pointer shrink-0"
              title="Back to MCP Servers"
            >
              <AltArrowLeft width={16} height={16} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-main m-0 leading-tight">Edit MCP Config</h1>
              <p className="text-sm text-muted mt-1">Cursor-format JSON — apply to sync servers and tools</p>
            </div>
          </div>
          <Button
            variant="primary"
            size="md"
            icon={<Diskette width={16} height={16} />}
            loading={saving}
            disabled={(!dirty && !saving) || loading}
            onClick={handleApply}
          >
            {saving ? "Applying…" : "Apply Config"}
          </Button>
        </div>

        {/* JSON config */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-soft">mcp.json</span>
            <RenderIf condition={dirty}>
              <span className="flex items-center gap-1.5 text-[10px] font-semibold text-primary/70">
                <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block animate-pulse" />
                Unsaved
              </span>
            </RenderIf>
          </div>
          <div className="rounded-lg overflow-hidden border border-border/60" style={{ backgroundColor: "var(--color-code, #1A1D23)" }}>
            <MonacoEditor
              language="json"
              value={loading ? '{\n  "mcpServers": {}\n}' : jsonText}
              onChange={handleJsonChange}
              onSave={handleApply}
              height="calc(100vh - 260px)"
              options={{
                fontFamily: "Geist Mono, ui-monospace, monospace",
                fontSize: 13,
                lineNumbers: "off",
                folding: true,
                renderLineHighlight: "line",
                readOnly: loading,
              }}
            />
          </div>
          <p className="text-[11px] text-muted mt-2 m-0">
            Format: <code className="text-soft">{`{ "mcpServers": { "name": { "url": "…", "headers": {} } } }`}</code>
          </p>
          <RenderIf condition={!!error}>
            <div className="mt-2 text-xs text-danger font-medium">{error}</div>
          </RenderIf>
          <RenderIf condition={!!syncMessage && !error}>
            <div className="mt-2 text-xs text-primary font-medium">{syncMessage}</div>
          </RenderIf>
        </div>
      </div>
    </div>
  );
}

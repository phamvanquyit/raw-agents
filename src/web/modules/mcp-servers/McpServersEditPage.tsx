import { AltArrowLeft, Diskette } from "@solar-icons/react";
import { Button, message } from "antd";
import type { Uri } from "monaco-editor";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "src/common/api";
import { type EditorInstance, type Monaco, MonacoEditor } from "src/components/MonacoEditor";
import RenderIf from "src/components/RenderIf";
import { useAppDispatch } from "src/store/store";
import { fetchMcpServers } from "./common/mcpServersSlice";

const EMPTY_CONFIG = `{\n  "mcpServers": {}\n}`;
const MODEL_PATH = "file:///mcp-servers/mcp.json";
const SCHEMA_URI = "inmemory://schema/mcp-config.json";

const SAMPLE = `{
  "mcpServers": {
    "my-server": {
      "url": "https://…",
      "headers": {
        "Authorization": "Bearer …"
      }
    }
  }
}`;

const MCP_CONFIG_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  required: ["mcpServers"],
  additionalProperties: false,
  properties: {
    mcpServers: {
      type: "object",
      description: "Map of MCP server name → connection config",
      additionalProperties: {
        type: "object",
        required: ["url"],
        additionalProperties: false,
        properties: {
          url: {
            type: "string",
            minLength: 1,
            description: "MCP server endpoint URL",
          },
          headers: {
            type: "object",
            additionalProperties: { type: "string" },
            description: "Optional HTTP headers",
          },
        },
      },
    },
  },
} as const;

type McpConfig = {
  mcpServers: Record<string, { url: string; headers?: Record<string, string> }>;
};

function configToJson(config: McpConfig): string {
  return JSON.stringify(config, null, 2);
}

function configureMcpJsonSchema(monaco: Monaco, modelUri: string) {
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: false,
    schemas: [
      {
        uri: SCHEMA_URI,
        fileMatch: [modelUri],
        schema: MCP_CONFIG_SCHEMA,
      },
    ],
  });
}

export default function McpServersEditPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const [jsonText, setJsonText] = useState(EMPTY_CONFIG);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasErrors, setHasErrors] = useState(false);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const config = await apiClient.get<McpConfig>("/api/mcp-servers/config");
      setJsonText(configToJson(config));
      setDirty(false);
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
      setJsonText(EMPTY_CONFIG);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const syncMarkers = useCallback((monaco: Monaco, uri: Uri) => {
    const markers = monaco.editor.getModelMarkers({ resource: uri });
    setHasErrors(markers.some((m: { severity: number }) => m.severity === monaco.MarkerSeverity.Error));
  }, []);

  const handleMount = useCallback(
    (editor: EditorInstance, monaco: Monaco) => {
      const model = editor.getModel();
      if (!model) return;

      configureMcpJsonSchema(monaco, model.uri.toString());
      syncMarkers(monaco, model.uri);

      const disposable = monaco.editor.onDidChangeMarkers((uris: readonly Uri[]) => {
        if (uris.some((u) => u.toString() === model.uri.toString())) {
          syncMarkers(monaco, model.uri);
        }
      });

      editor.onDidDispose(() => disposable.dispose());
    },
    [syncMarkers],
  );

  const handleJsonChange = (value: string | undefined) => {
    setJsonText(value ?? "");
    setDirty(true);
  };

  const handleSaveAndSync = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      message.error("Fix the JSON before saving");
      return;
    }

    if (hasErrors) {
      message.error("Fix schema errors in the editor before saving");
      return;
    }

    setSaving(true);
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
        message.warning(result.syncErrors.map((e) => `${e.name}: ${e.error}`).join("; "));
      } else {
        message.success(parts.length > 0 ? `Synced — ${parts.join(", ")}` : "Synced — no changes");
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border-subtle bg-card px-4">
        <button
          type="button"
          onClick={() => navigate("/mcp-servers")}
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent bg-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground focus-visible:outline-none"
          title="Back"
          aria-label="Back to MCP servers"
        >
          <AltArrowLeft width={16} height={16} />
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <h1 className="m-0 truncate text-base font-semibold leading-5 text-foreground">MCP config</h1>
          <RenderIf condition={dirty && !saving}>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-brand-soft">
              <span className="size-1.5 animate-pulse rounded-full bg-brand-soft" />
              Unsaved
            </span>
          </RenderIf>
        </div>

        <Button
          type="primary"
          size="small"
          icon={!saving ? <Diskette width={14} height={14} /> : undefined}
          loading={saving}
          disabled={(!dirty && !saving) || loading || hasErrors}
          onClick={handleSaveAndSync}
        >
          {saving ? "Syncing…" : "Save & sync"}
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="relative flex min-h-0 min-w-0 flex-col border-b border-border-subtle lg:border-b-0 lg:border-r">
          <div className="flex h-9 shrink-0 items-center justify-between border-b border-border-subtle bg-card px-4">
            <span className="font-mono text-[11px] text-muted-foreground">mcp.json</span>
            <span className="text-[11px] text-quaternary-foreground">{loading ? "Loading…" : "⌘S to save"}</span>
          </div>
          <div className="min-h-0 flex-1 bg-muted/40">
            <MonacoEditor
              path={MODEL_PATH}
              language="json"
              value={loading ? EMPTY_CONFIG : jsonText}
              onChange={handleJsonChange}
              onSave={handleSaveAndSync}
              onMount={handleMount}
              height="100%"
              options={{
                fontFamily: "var(--font-family-mono)",
                fontSize: 13,
                lineNumbers: "off",
                folding: true,
                renderLineHighlight: "line",
                readOnly: loading,
                padding: { top: 12, bottom: 16 },
              }}
            />
          </div>
        </section>

        <aside className="flex min-h-0 flex-col overflow-hidden bg-card">
          <div className="flex h-9 shrink-0 items-center border-b border-border-subtle px-4">
            <span className="text-[11px] font-medium text-muted-foreground">Guide</span>
          </div>

          <div className="game-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <p className="m-0 text-[13px] leading-relaxed text-muted-foreground">
              Edit Cursor-format MCP config. Save applies create / update / delete, then syncs tools from each server.
            </p>

            <p className="mb-2 mt-6 m-0 text-[11px] font-medium text-muted-foreground">Format</p>
            <pre className="m-0 overflow-x-auto rounded-lg border border-border-subtle bg-muted/40 px-3 py-2.5 font-mono text-[10px] leading-relaxed text-tertiary-foreground">
              {SAMPLE}
            </pre>

            <ul className="mt-6 m-0 list-none space-y-2.5 p-0 text-[12px] leading-relaxed text-muted-foreground">
              <li>Servers are keyed by name under mcpServers.</li>
              <li>url is required; headers are optional.</li>
              <li>Unknown keys (e.g. serverUrl) show as errors in the editor.</li>
              <li>Removing a name deletes that server.</li>
              <li>Connect errors deactivate the server automatically.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

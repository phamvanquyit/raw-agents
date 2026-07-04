import { CloseCircle, Play } from "@solar-icons/react";
import { type Ref, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { apiClient } from "src/common/api";
import { MonacoEditor } from "src/components/ui/MonacoEditor";
import type { Param } from "../../common/constants";
import { parseParamsFromCode } from "../../common/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type RunStatus = "idle" | "running" | "ok" | "error";

interface RunResult {
  status: RunStatus;
  output: string;
  console?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function tryPretty(raw: unknown): string {
  if (typeof raw === "string") {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  }
  if (typeof raw === "object" && raw !== null) return JSON.stringify(raw, null, 2);
  if (raw === null || raw === undefined) return "(null)";
  return String(raw);
}

function buildDefaultJson(params: Param[]): string {
  const obj: Record<string, unknown> = {};
  for (const p of params) {
    if (p.type === "number") obj[p.name] = 0;
    else if (p.type === "boolean") obj[p.name] = false;
    else if (p.type === "array") obj[p.name] = [];
    else if (p.type === "object") obj[p.name] = {};
    else obj[p.name] = "";
  }
  return JSON.stringify(obj, null, 2);
}

// ── RunPanel ──────────────────────────────────────────────────────────────────
// Redesigned for narrow sidebar (280-380px) — Dark neon theme

interface RunPanelProps {
  code: string;
  toolId?: string;
}

export interface RunPanelHandle {
  setExternalResult: (result: {
    ok: boolean;
    output?: any;
    error?: string;
    console?: string;
  }) => void;
  setRunning: (running: boolean) => void;
}

export const RunPanel = forwardRef(function RunPanel({ code, toolId = "default" }: RunPanelProps, ref: Ref<RunPanelHandle>) {
  const [result, setResult] = useState<RunResult | null>(null);
  const [runPhase, setRunPhase] = useState<"idle" | "installing" | "running">("idle");
  const [hasJsonError, setHasJsonError] = useState(false);

  const jsonTextRef = useRef("{}");
  const [jsonText, setJsonText] = useState("{}");

  const params = useMemo(() => parseParamsFromCode(code), [code]);
  const prevParamKeysRef = useRef<string>("");

  useEffect(() => {
    const keys = params.map((p) => p.name).join(",");
    if (keys === prevParamKeysRef.current) return;
    prevParamKeysRef.current = keys;
    const defaultJson = params.length > 0 ? buildDefaultJson(params) : "{}";
    setJsonText(defaultJson);
    jsonTextRef.current = defaultJson;
  }, [params]);

  useImperativeHandle(
    ref,
    () => ({
      setExternalResult: (res) => {
        setRunPhase("idle");
        if (res.ok) {
          setResult({
            status: "ok",
            output: tryPretty(res.output),
            console: res.console?.trim() || undefined,
          });
        } else {
          setResult({
            status: "error",
            output: tryPretty(res.error ?? "Unknown error"),
            console: res.console?.trim() || undefined,
          });
        }
      },
      setRunning: (running) => {
        if (running) {
          setRunPhase("running");
          setResult({ status: "running", output: "" });
        } else {
          setRunPhase("idle");
        }
      },
    }),
    [],
  );

  const isRunning = runPhase !== "idle";

  const phaseLabel = runPhase === "installing" ? "Installing deps…" : runPhase === "running" ? "Running…" : "";

  async function handleRun() {
    if (hasJsonError) return;
    setResult({ status: "running", output: "" });
    setRunPhase("installing");

    try {
      const inputJson = jsonTextRef.current;
      setRunPhase("running");

      const parsed = (await apiClient.post(`/api/tools/${toolId}/run`, { inputJson, code })) as {
        ok: boolean;
        result?: unknown;
        error?: string;
        console?: string;
      };

      const consoleOut = parsed.console?.trim() ?? "";

      if (parsed.ok) {
        setResult({
          status: "ok",
          output: tryPretty(parsed.result),
          console: consoleOut || undefined,
        });
      } else {
        setResult({
          status: "error",
          output: parsed.error ?? "Unknown error",
          console: consoleOut || undefined,
        });
      }
    } catch (err) {
      setResult({ status: "error", output: String(err) });
    } finally {
      setRunPhase("idle");
    }
  }

  const editorLineCount = Math.min(12, Math.max(5, (jsonText.match(/\n/g)?.length ?? 0) + 1));

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Input section ── */}
      <div className="shrink-0 p-3 border-b border-border">
        {/* Header + Run button */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Input</span>
          <button
            type="button"
            disabled={isRunning || !code.trim() || hasJsonError}
            onClick={handleRun}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold text-secondary bg-primary hover:bg-primary-hover transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border-0"
          >
            {isRunning ? (
              <span className="w-3 h-3 border-[1.5px] border-secondary/30 border-t-secondary rounded-full animate-spin" />
            ) : (
              <Play size={11} className="fill-current" />
            )}
            {isRunning ? "Running" : "Run"}
          </button>
        </div>

        {/* Param badges */}
        {params.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {params.map((p) => (
              <span
                key={p.name}
                className={[
                  "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono",
                  p.required ? "bg-primary/10 text-primary" : "bg-surface-raised text-muted",
                ].join(" ")}
              >
                {p.name}
              </span>
            ))}
          </div>
        )}

        {/* JSON editor */}
        <div className="rounded-md overflow-hidden border border-border">
          <MonacoEditor
            language="json"
            value={jsonText}
            height={editorLineCount * 18}
            onChange={(v) => {
              const val = v ?? "{}";
              setJsonText(val);
              jsonTextRef.current = val;
            }}
            onValidate={(markers) => {
              setHasJsonError(markers.some((m) => m.severity >= 8));
            }}
            options={{
              fontSize: 11,
              fontFamily: "'Geist Mono Variable', 'Geist Mono', monospace",
              minimap: { enabled: false },
              lineNumbers: "off",
              folding: false,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              wordWrap: "on",
              scrollbar: { vertical: "hidden", horizontal: "hidden" },
              overviewRulerLanes: 0,
              renderLineHighlight: "none",
              stickyScroll: { enabled: false },
              padding: { top: 6, bottom: 6 },
            }}
          />
        </div>

        {hasJsonError && <span className="text-[10px] text-danger mt-1 block">Invalid JSON — fix before running</span>}
      </div>

      {/* ── Output section ── */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Output</span>
          {result && !isRunning && (
            <div className="flex items-center gap-1">
              <span
                className={[
                  "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold",
                  result.status === "ok" ? "bg-primary/10 text-primary" : "bg-danger/10 text-danger",
                ].join(" ")}
              >
                {result.status === "ok" ? "✓ OK" : "✗ Error"}
              </span>
              <button
                type="button"
                title="Clear"
                onClick={() => setResult(null)}
                className="p-0.5 text-muted hover:text-main transition-colors cursor-pointer border-0 bg-transparent"
              >
                <CloseCircle size={11} />
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto game-scrollbar p-3">
          {!result && !isRunning && (
            <div className="flex items-center justify-center h-full">
              <span className="text-[11px] text-muted italic">Run to see output</span>
            </div>
          )}

          {isRunning && (
            <div className="flex items-center justify-center h-full">
              <span className="text-[11px] text-muted italic">{phaseLabel}</span>
            </div>
          )}

          {result && !isRunning && (
            <div className="flex flex-col gap-2">
              {result.console && (
                <div>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted mb-1 block">Console</span>
                  <pre className="bg-code text-soft text-[10px] font-mono leading-relaxed px-2.5 py-2 rounded-md overflow-x-auto whitespace-pre-wrap break-all m-0">
                    {result.console}
                  </pre>
                </div>
              )}
              <div
                className={[
                  "rounded-md border px-2.5 py-2",
                  result.status === "ok" ? "bg-primary/5 border-primary/15 text-primary" : "bg-danger/5 border-danger/15 text-danger",
                ].join(" ")}
              >
                <pre className="font-mono text-[10px] leading-relaxed whitespace-pre-wrap break-all m-0">{result.output || "(empty output)"}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

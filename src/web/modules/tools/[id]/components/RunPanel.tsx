import { CloseCircle } from "@solar-icons/react";
import { type Ref, forwardRef, useImperativeHandle, useRef, useState } from "react";

type RunStatus = "idle" | "running" | "ok" | "error";

interface RunResult {
  status: RunStatus;
  output: string;
  console?: string;
  input?: string;
}

export interface RunPanelHandle {
  setExternalResult: (result: {
    ok: boolean;
    output?: unknown;
    error?: string;
    console?: string;
  }) => void;
  setRunning: (running: boolean, testInput?: unknown) => void;
}

interface RunPanelProps {
  onClose?: () => void;
}

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

export const RunPanel = forwardRef(function RunPanel({ onClose }: RunPanelProps, ref: Ref<RunPanelHandle>) {
  const [result, setResult] = useState<RunResult | null>(null);
  const [runPhase, setRunPhase] = useState<"idle" | "running">("idle");
  const [liveInput, setLiveInput] = useState<string | undefined>(undefined);
  const pendingInputRef = useRef<string | undefined>(undefined);

  useImperativeHandle(
    ref,
    () => ({
      setExternalResult: (res) => {
        const input = pendingInputRef.current;
        setRunPhase("idle");
        setResult({
          status: res.ok ? "ok" : "error",
          output: tryPretty(res.ok ? res.output : (res.error ?? "Unknown error")),
          console: res.console?.trim() || undefined,
          input,
        });
        pendingInputRef.current = undefined;
        setLiveInput(undefined);
      },
      setRunning: (running, testInput) => {
        if (running) {
          const inputStr = testInput !== undefined ? tryPretty(testInput) : undefined;
          pendingInputRef.current = inputStr;
          setLiveInput(inputStr);
          setRunPhase("running");
          setResult({ status: "running", output: "", input: inputStr });
        } else {
          setRunPhase("idle");
        }
      },
    }),
    [],
  );

  const isRunning = runPhase === "running";
  const displayInput = result?.input ?? liveInput;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-card">
      <div className="shrink-0 flex items-center justify-between gap-2 px-4 h-10 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground">Agent test</span>
        <div className="flex items-center gap-1.5">
          {result && !isRunning && (
            <span
              className={[
                "inline-flex items-center h-5 px-1.5 rounded-sm text-[11px] font-medium",
                result.status === "ok" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
              ].join(" ")}
            >
              {result.status === "ok" ? "OK" : "Error"}
            </span>
          )}
          {onClose && (
            <button
              type="button"
              title="Close"
              onClick={onClose}
              className="flex items-center justify-center size-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer border-0 bg-transparent"
            >
              <CloseCircle size={13} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {!result && !isRunning && (
          <div className="flex items-center justify-center h-full p-4">
            <p className="text-xs text-muted-foreground m-0">Agent test runs will appear here.</p>
          </div>
        )}

        {isRunning && !displayInput && (
          <div className="flex items-center justify-center h-full p-4">
            <p className="text-xs text-muted-foreground m-0">Agent is running a test…</p>
          </div>
        )}

        {(displayInput || (result && !isRunning) || (isRunning && displayInput)) && (
          <div className="flex flex-col gap-4 p-4 min-w-0">
            {displayInput && (
              <div className="min-w-0">
                <span className="text-xs font-medium text-muted-foreground mb-2 block">Input</span>
                <pre className="bg-background border border-border-subtle text-foreground text-xs font-mono leading-relaxed px-3 py-2.5 rounded-lg overflow-x-auto whitespace-pre m-0">
                  {displayInput}
                </pre>
              </div>
            )}

            {isRunning && displayInput && <p className="text-xs text-muted-foreground m-0">Running…</p>}

            {result && !isRunning && (
              <>
                {result.console && (
                  <div className="min-w-0">
                    <span className="text-xs font-medium text-muted-foreground mb-2 block">Console</span>
                    <pre className="bg-background border border-border-subtle text-tertiary-foreground text-xs font-mono leading-relaxed px-3 py-2.5 rounded-lg overflow-x-auto whitespace-pre m-0">
                      {result.console}
                    </pre>
                  </div>
                )}
                <div className="min-w-0">
                  <span className="text-xs font-medium text-muted-foreground mb-2 block">Output</span>
                  <div
                    className={[
                      "rounded-lg border px-3 py-2.5 overflow-x-auto",
                      result.status === "ok" ? "bg-success/5 border-success/20 text-success" : "bg-destructive/5 border-destructive/20 text-destructive",
                    ].join(" ")}
                  >
                    <pre className="font-mono text-xs leading-relaxed whitespace-pre m-0">{result.output || "(empty output)"}</pre>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

import { type ReactNode, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Agent } from "src/common/types";
import { UserAvatar } from "src/components/UserAvatar";
import RenderIf from "src/components/ui/RenderIf";
import { Spinner } from "src/components/ui/spinner";
import { cn } from "src/lib/utils";
import { useAppSelector } from "src/store/store";
import { parseCallAgentToolTargetId, prettyJson } from "../../common/utils";
import { CodeBlock } from "../CodeBlock";
import { MarkdownTable } from "../MarkdownTable";
import "../markdown.css";
import type { ToolUIProps } from "./types";

const mdComponents: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "");
    const lang = match?.[1] ?? "";
    const codeText = String(children).replace(/\n$/, "");
    const isBlock = codeText.includes("\n") || !!match;
    if (isBlock) return <CodeBlock language={lang}>{codeText}</CodeBlock>;
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
  table({ children }) {
    return <MarkdownTable>{children}</MarkdownTable>;
  },
};

function parseCallAgentOutput(raw: string | null | undefined): {
  success: boolean;
  response: string | null;
  agentId: string | null;
  error: string | null;
} | null {
  if (!raw) return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (typeof parsed === "object" && parsed !== null && "success" in parsed) {
      return {
        success: Boolean(parsed.success),
        response: parsed.response ?? null,
        agentId: parsed.agent_id ?? null,
        error: parsed.error ?? null,
      };
    }
  } catch {}
  return null;
}

function AgentTurn({
  name,
  avatar,
  avatarSeed,
  children,
  align = "start",
}: {
  name: string;
  avatar?: string | null;
  avatarSeed: string;
  children: ReactNode;
  align?: "start" | "end";
}) {
  return (
    <div className={cn("flex items-start gap-2.5", align === "end" && "flex-row-reverse")}>
      <UserAvatar avatar={avatar} name={avatar ? name : avatarSeed} size={24} className="mt-0.5 shrink-0 ring-1 ring-border" />
      <div className={cn("min-w-0 flex-1 flex flex-col gap-1", align === "end" && "items-end")}>
        <span className="text-[11px] font-medium text-muted-foreground select-none">{name}</span>
        <div className="max-w-[92%]">{children}</div>
      </div>
    </div>
  );
}

function ExpandableBody({ children, className }: { children: ReactNode; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) setOverflows(el.scrollHeight > 160);
  }, [children]);

  return (
    <div>
      <div ref={bodyRef} className={cn("overflow-hidden transition-[max-height] duration-200", !expanded && "max-h-40", className)}>
        {children}
      </div>
      <RenderIf condition={overflows}>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer border-0 bg-transparent p-0"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      </RenderIf>
    </div>
  );
}

export function CallAgentToolUI({ msg, assistantLabel = "Assistant" }: ToolUIProps) {
  const hasOutput = msg.toolOutput != null;
  const hasError = Boolean(msg.toolError);

  const agents = useAppSelector((s) => s.agents.items) as Agent[];

  let calledAgentId: string | undefined;
  calledAgentId = (msg.toolInput as Record<string, unknown> | null)?.agent_id as string | undefined;
  if (!calledAgentId && msg.toolName) {
    calledAgentId = parseCallAgentToolTargetId(msg.toolName) ?? undefined;
  }
  if (!calledAgentId && msg.toolOutput) {
    try {
      const parsed = JSON.parse(msg.toolOutput);
      calledAgentId = parsed?.agent_id;
    } catch {
      /* ignore */
    }
  }
  const calledAgent = calledAgentId ? agents.find((a) => a.id === calledAgentId) : undefined;

  const parsed = parseCallAgentOutput(msg.toolOutput);
  const requestMessage = (msg.toolInput as Record<string, unknown> | null)?.message as string | undefined;

  const callerName = assistantLabel;
  const calleeName = calledAgent?.name ?? msg.toolLabel?.replace(/^Call\s+/i, "") ?? "Agent";
  const callerSeed = `caller:${callerName}`;
  const calleeSeed = calledAgentId ? `agent:${calledAgentId}` : `agent:${calleeName}`;

  return (
    <div className="ca-fade-in mt-1 px-4 py-1">
      <div className="rounded-lg border border-border bg-card/60 px-3 py-3 flex flex-col gap-3.5">
        <AgentTurn name={callerName} avatarSeed={callerSeed} align="end">
          <div className="rounded-2xl rounded-tr-sm bg-primary/10 border border-primary/15 px-3 py-2 text-left">
            <p className="text-[12px] text-foreground leading-[1.55] m-0 whitespace-pre-wrap">{requestMessage || "(no message)"}</p>
          </div>
        </AgentTurn>

        <AgentTurn name={calleeName} avatar={calledAgent?.avatar} avatarSeed={calleeSeed} align="start">
          <div className="rounded-2xl rounded-tl-sm bg-muted/60 border border-border px-3 py-2 text-left">
            <RenderIf condition={hasError}>
              <p className="text-[12px] text-destructive leading-[1.55] m-0">{parsed?.error ?? "Agent call failed"}</p>
            </RenderIf>

            <RenderIf condition={!hasError && !hasOutput}>
              <div className="flex items-center gap-1.5 py-0.5">
                <Spinner className="size-3 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground italic">Replying…</span>
              </div>
            </RenderIf>

            <RenderIf condition={!hasError && hasOutput && !!parsed}>
              {() => (
                <ExpandableBody>
                  <div className="ca-markdown text-[12px] text-foreground leading-[1.55] [&_h1]:text-[14px] [&_h2]:text-[13px] [&_h3]:text-[12px] [&_p]:text-[12px] [&_li]:text-[12px] [&_td]:text-[11px] [&_th]:text-[11px] [&_code]:text-[11px] [&_p]:m-0 [&_p+p]:mt-2">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                      {parsed?.response ?? "(no response)"}
                    </ReactMarkdown>
                  </div>
                </ExpandableBody>
              )}
            </RenderIf>

            <RenderIf condition={!hasError && hasOutput && !parsed}>
              <ExpandableBody>
                <pre className="text-[11px] text-muted-foreground leading-[1.5] whitespace-pre-wrap break-all m-0 font-mono">{prettyJson(msg.toolOutput)}</pre>
              </ExpandableBody>
            </RenderIf>
          </div>
        </AgentTurn>
      </div>
    </div>
  );
}

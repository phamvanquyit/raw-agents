import { Bookmark, ClipboardRemove, Cpu, DangerCircle, Document, DocumentText, Notes, Restart, TrashBinMinimalistic } from "@solar-icons/react";
import type { ReactNode } from "react";
import RenderIf from "src/components/RenderIf";
import { useAppSelector } from "src/store/store";
import type { ToolUIProps } from "./types";

type MemoryAction = "add_facts" | "remove_facts" | "list" | "save_doc" | "read_doc" | "delete_doc" | string;

type MemoryFact = { id?: string; content: string };
type MemoryDoc = { id?: string; title: string; content?: string };

type MemoryInput = {
  action?: MemoryAction;
  facts?: string[];
  fact_ids?: string[];
  id?: string;
  title?: string;
  content?: string;
};

type MemoryOutput = {
  ok?: boolean;
  error?: string;
  added?: number;
  removed?: number;
  facts?: MemoryFact[];
  documents?: MemoryDoc[];
  id?: string;
  title?: string;
  content?: string;
  message?: string;
};

function parseJson<T>(raw: unknown): T | null {
  if (raw == null) return null;
  if (typeof raw === "object") return raw as T;
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as T;
  } catch {
    /* ignore */
  }
  return null;
}

function actionVerb(action: MemoryAction | undefined, running: boolean, failed: boolean): string {
  if (failed) return "Memory update failed";
  if (running) {
    switch (action) {
      case "add_facts":
        return "Remembering…";
      case "remove_facts":
        return "Forgetting…";
      case "list":
        return "Recalling…";
      case "save_doc":
        return "Saving to memory…";
      case "read_doc":
        return "Reading memory…";
      case "delete_doc":
        return "Erasing…";
      default:
        return "Updating memory…";
    }
  }
  switch (action) {
    case "add_facts":
      return "Remembered";
    case "remove_facts":
      return "Forgot";
    case "list":
      return "Recalled";
    case "save_doc":
      return "Saved to memory";
    case "read_doc":
      return "Opened memory";
    case "delete_doc":
      return "Erased";
    default:
      return "Memory";
  }
}

function actionIcon(action: MemoryAction | undefined, failed: boolean, running: boolean): ReactNode {
  if (failed) return <DangerCircle size={13} className="text-destructive shrink-0" />;
  if (running) return <Restart size={12} className="animate-spin text-muted-foreground shrink-0" />;
  switch (action) {
    case "add_facts":
      return <Bookmark size={13} className="text-muted-foreground shrink-0" />;
    case "remove_facts":
      return <ClipboardRemove size={13} className="text-muted-foreground shrink-0" />;
    case "list":
      return <Cpu size={13} className="text-muted-foreground shrink-0" />;
    case "save_doc":
      return <Document size={13} className="text-muted-foreground shrink-0" />;
    case "read_doc":
      return <DocumentText size={13} className="text-muted-foreground shrink-0" />;
    case "delete_doc":
      return <TrashBinMinimalistic size={13} className="text-muted-foreground shrink-0" />;
    default:
      return <Notes size={13} className="text-muted-foreground shrink-0" />;
  }
}

function FactChip({ content }: { content: string }) {
  return (
    <span className="inline-flex max-w-full items-center rounded-md border border-border-subtle bg-muted/40 px-2 py-1 text-[11px] leading-[1.4] text-foreground/90">
      <span className="truncate">{content}</span>
    </span>
  );
}

function DocRow({ title, preview }: { title: string; preview?: string }) {
  return (
    <div className="rounded-md border border-border-subtle bg-muted/25 px-2.5 py-2 min-w-0">
      <div className="flex items-center gap-1.5 min-w-0">
        <DocumentText size={12} className="text-muted-foreground shrink-0" />
        <span className="text-[12px] font-medium text-foreground truncate">{title}</span>
      </div>
      <RenderIf condition={!!preview}>
        {() => <p className="m-0 mt-1 text-[11px] text-muted-foreground leading-[1.45] line-clamp-3 whitespace-pre-wrap">{preview}</p>}
      </RenderIf>
    </div>
  );
}

export function ManageMemoryToolUI({ msg, assistantLabel = "Assistant", assistantColor, showAvatar = true }: ToolUIProps) {
  const hasOutput = msg.toolOutput != null;
  const hasError = Boolean(msg.toolError);
  const input = parseJson<MemoryInput>(msg.toolInput) ?? {};
  const output = parseJson<MemoryOutput>(msg.toolOutput);
  const failed = hasError || output?.ok === false;
  const activeConvId = useAppSelector((s) => s.chat.activeConversationId);
  const conversations = useAppSelector((s) => s.chat.conversations);
  const isConvRunning = conversations.find((c) => c.id === activeConvId)?.status === "running";
  const running = !hasOutput && !hasError && !!isConvRunning;
  const callerColor = assistantColor ?? "var(--primary)";
  const action = input.action;

  const addedFacts: MemoryFact[] =
    output?.facts?.filter((f) => f.content?.trim()) ??
    (input.facts ?? []).filter((f) => f.trim()).map((content) => ({ content: content.trim() }));

  const listedFacts = (output?.facts ?? []).filter((f) => f.content?.trim());
  const listedDocs = output?.documents ?? [];
  const docTitle = output?.title ?? input.title ?? "Document";
  const docPreview = output?.content ?? input.content;
  const removeCount = output?.removed ?? input.fact_ids?.length ?? 0;
  const addCount = output?.added ?? addedFacts.length;

  const summaryExtra = (() => {
    if (running || failed) return null;
    if (action === "add_facts" && addCount > 0) return `${addCount} fact${addCount === 1 ? "" : "s"}`;
    if (action === "remove_facts" && removeCount > 0) return `${removeCount} fact${removeCount === 1 ? "" : "s"}`;
    if (action === "list") {
      const parts: string[] = [];
      if (listedFacts.length) parts.push(`${listedFacts.length} fact${listedFacts.length === 1 ? "" : "s"}`);
      if (listedDocs.length) parts.push(`${listedDocs.length} doc${listedDocs.length === 1 ? "" : "s"}`);
      return parts.join(" · ") || "empty";
    }
    if (action === "save_doc" || action === "read_doc" || action === "delete_doc") return docTitle;
    return null;
  })();

  const showBody =
    !running &&
    !failed &&
    ((action === "add_facts" && addedFacts.length > 0) ||
      (action === "list" && (listedFacts.length > 0 || listedDocs.length > 0 || hasOutput)) ||
      (action === "save_doc" && !!docTitle) ||
      (action === "read_doc" && (!!docTitle || !!docPreview)) ||
      (action === "delete_doc" && !!docTitle));

  return (
    <div className="animate-[fadeIn_0.28s_ease-out_both] mt-1">
      <RenderIf condition={showAvatar}>
        <div className="flex items-center gap-2.5 px-4 pt-3 pb-1">
          <span
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase select-none"
            style={{ background: callerColor, color: "var(--primary-foreground)", letterSpacing: "0.08em" }}
          >
            {assistantLabel}
          </span>
        </div>
      </RenderIf>

      <div className="px-4 pb-1">
        <div className="rounded-lg border border-border-subtle overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/30">
            {actionIcon(action, failed, running)}
            <span className="text-[12px] font-medium text-muted-foreground truncate min-w-0">
              {actionVerb(action, running, failed)}
              <RenderIf condition={!!summaryExtra}>
                {() => <span className="text-tertiary-foreground"> · {summaryExtra}</span>}
              </RenderIf>
            </span>
          </div>

          <RenderIf condition={failed && !!(output?.error || msg.toolError)}>
            {() => (
              <div className="border-t border-border-subtle px-3 py-2">
                <p className="m-0 text-[11px] text-destructive leading-[1.45]">{output?.error ?? "Tool execution failed"}</p>
              </div>
            )}
          </RenderIf>

          <RenderIf condition={showBody}>
            <div className="border-t border-border-subtle px-3 py-2.5 flex flex-col gap-2">
              <RenderIf condition={action === "add_facts"}>
                <div className="flex flex-wrap gap-1.5">
                  {addedFacts.map((fact, i) => (
                    <FactChip key={fact.id ?? `${fact.content}-${i}`} content={fact.content} />
                  ))}
                </div>
              </RenderIf>

              <RenderIf condition={action === "list"}>
                <div className="flex flex-col gap-2">
                  <RenderIf condition={listedFacts.length > 0}>
                    <div className="flex flex-wrap gap-1.5">
                      {listedFacts.map((fact, i) => (
                        <FactChip key={fact.id ?? `${fact.content}-${i}`} content={fact.content} />
                      ))}
                    </div>
                  </RenderIf>
                  <RenderIf condition={listedDocs.length > 0}>
                    <div className="flex flex-col gap-1.5">
                      {listedDocs.map((doc, i) => (
                        <DocRow key={doc.id ?? `${doc.title}-${i}`} title={doc.title} />
                      ))}
                    </div>
                  </RenderIf>
                  <RenderIf condition={listedFacts.length === 0 && listedDocs.length === 0}>
                    <span className="text-[11px] text-muted-foreground">No memories yet</span>
                  </RenderIf>
                </div>
              </RenderIf>

              <RenderIf condition={action === "save_doc" || action === "read_doc"}>
                <DocRow title={docTitle} preview={docPreview} />
              </RenderIf>

              <RenderIf condition={action === "delete_doc"}>
                <DocRow title={docTitle} />
              </RenderIf>
            </div>
          </RenderIf>
        </div>
      </div>
    </div>
  );
}

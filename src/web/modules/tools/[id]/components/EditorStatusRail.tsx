import Programming from "@solar-icons/react/it/Programming";
import CheckCircle from "@solar-icons/react/ui/CheckCircle";
import CloseCircle from "@solar-icons/react/ui/CloseCircle";
import { Popover, Table } from "antd";
import type { Param } from "../../common/constants";

interface EditorStatusRailProps {
  name?: string;
  description?: string;
  params: Param[];
  hasReturn: boolean;
}

function chipClass(ok: boolean) {
  return [
    "inline-flex items-center gap-1 h-6 px-2 rounded-md text-xs font-medium border transition-colors",
    ok
      ? "border-border-subtle bg-secondary text-foreground hover:border-border"
      : "border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-border",
  ].join(" ");
}

function StatusChip({
  ok,
  label,
  title,
  detail,
  example,
}: {
  ok: boolean;
  label: string;
  title: string;
  detail: string;
  example?: string;
}) {
  return (
    <Popover
      trigger="click"
      placement="bottomLeft"
      content={
        <div className="flex flex-col gap-2 w-72">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-medium text-foreground">{title}</span>
            <span className={["text-xs font-medium shrink-0", ok ? "text-success" : "text-warn"].join(" ")}>{ok ? "Detected" : "Missing"}</span>
          </div>
          <p className="text-sm text-tertiary-foreground leading-relaxed m-0">{detail}</p>
          {example && (
            <code className="block text-xs font-mono text-brand-soft bg-secondary border border-border-subtle rounded-md px-2.5 py-2 leading-relaxed whitespace-pre-wrap">
              {example}
            </code>
          )}
        </div>
      }
    >
      <button type="button" className={[chipClass(ok), "cursor-pointer"].join(" ")}>
        {ok ? <CheckCircle size={12} className="text-success" /> : <CloseCircle size={12} className="opacity-40" />}
        <span className="font-mono text-[11px]">{label}</span>
      </button>
    </Popover>
  );
}

function ParamsChip({ params }: { params: Param[] }) {
  const unique = params.filter((p, i, arr) => arr.findIndex((x) => x.name === p.name) === i);
  const ok = unique.length > 0;

  return (
    <Popover
      trigger="click"
      placement="bottomLeft"
      styles={{ root: { maxWidth: "min(640px, calc(100vw - 32px))" } }}
      content={
        <div className="flex flex-col gap-2 w-[560px] max-w-[calc(100vw-48px)]">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-medium text-foreground">Input parameters</span>
            <span className={["text-xs font-medium shrink-0", ok ? "text-success" : "text-warn"].join(" ")}>{ok ? `${unique.length} declared` : "None"}</span>
          </div>

          {ok ? (
            <Table
              size="small"
              pagination={false}
              rowKey="name"
              dataSource={unique}
              columns={[
                {
                  title: "Name",
                  dataIndex: "name",
                  key: "name",
                  width: 140,
                  render: (v: string) => <span className="font-mono text-xs text-foreground">{v}</span>,
                },
                {
                  title: "Type",
                  dataIndex: "type",
                  key: "type",
                  width: 88,
                  render: (v: string) => <span className="font-mono text-xs text-brand-soft">{v}</span>,
                },
                {
                  title: "Required",
                  dataIndex: "required",
                  key: "required",
                  width: 88,
                  render: (v: boolean) => <span className={["text-xs", v ? "text-foreground" : "text-muted-foreground"].join(" ")}>{v ? "Yes" : "No"}</span>,
                },
                {
                  title: "Description",
                  dataIndex: "description",
                  key: "description",
                  render: (v: string) => <span className="text-xs text-tertiary-foreground leading-relaxed whitespace-normal">{v || "—"}</span>,
                },
              ]}
            />
          ) : (
            <>
              <p className="text-sm text-tertiary-foreground leading-relaxed m-0">Optional but recommended. Declares inputs the agent must pass in.</p>
              <code className="block text-xs font-mono text-brand-soft bg-secondary border border-border-subtle rounded-md px-2.5 py-2 leading-relaxed whitespace-pre-wrap">
                {"# @param {string} query (required) - Search text\n# @param {number} limit (optional) - Max results"}
              </code>
            </>
          )}
        </div>
      }
    >
      <button type="button" className={[chipClass(ok), "cursor-pointer"].join(" ")}>
        {ok ? <CheckCircle size={12} className="text-success" /> : <CloseCircle size={12} className="opacity-40" />}
        <span className="font-mono text-[11px]">{ok ? `${unique.length} params` : "params"}</span>
      </button>
    </Popover>
  );
}

export function EditorStatusRail({ name, description, params, hasReturn }: EditorStatusRailProps) {
  const hasName = !!name?.trim();
  const hasDescription = !!description?.trim();

  return (
    <div className="shrink-0 flex items-center gap-2 h-10 px-3 border-b border-border bg-card/80">
      <Popover
        trigger="click"
        placement="bottomLeft"
        content={
          <div className="flex flex-col gap-1.5 w-64">
            <span className="text-sm font-medium text-foreground">Python sandbox</span>
            <p className="text-sm text-tertiary-foreground leading-relaxed m-0">
              This tool runs as a Python script. Agents call it like a function and receive the return value.
            </p>
          </div>
        }
      >
        <button
          type="button"
          className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md bg-secondary text-tertiary-foreground text-xs font-medium shrink-0 cursor-pointer border-0 hover:text-foreground transition-colors"
        >
          <Programming size={13} className="text-brand" />
          Python
        </button>
      </Popover>

      <div className="w-px h-4 bg-border shrink-0" />

      <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-x-auto">
        <StatusChip
          ok={hasName}
          label="@name"
          title="Tool display name"
          detail={hasName ? `Current name: ${name!.trim()}` : "Required. Gives the tool a human-readable label in the UI and for agents."}
          example="# @name Search Products"
        />
        <StatusChip
          ok={hasDescription}
          label="@description"
          title="What this tool does"
          detail={hasDescription ? `Current description: ${description!.trim()}` : "Required. Short summary so agents know when to call this tool."}
          example="# @description Search products by query and tags"
        />
        <ParamsChip params={params} />
        <span className={chipClass(hasReturn)} title={hasReturn ? "Return statement found" : "Missing return statement"}>
          {hasReturn ? <CheckCircle size={12} className="text-success" /> : <CloseCircle size={12} className="opacity-40" />}
          <span className="font-mono text-[11px]">return</span>
        </span>
      </div>
    </div>
  );
}

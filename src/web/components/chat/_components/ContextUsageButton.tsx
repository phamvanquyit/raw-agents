import { Chart } from "@solar-icons/react";
import { Popover } from "antd";
import { useState } from "react";
import { cn } from "src/common/lib/cn";
import { type UsageCategory, formatTokenCount } from "src/modules/usage/common/usageApi";

const CATEGORY_COLORS: Record<string, string> = {
  system_prompt: "#8b8b8b",
  tools: "#a78bfa",
  conversation: "#fb923c",
};

const TRIGGER_CLASS =
  "flex h-7 items-center gap-1.5 rounded-lg border-0 px-2 text-[11px] font-medium leading-none transition-all duration-150 cursor-pointer outline-none";

export type ContextUsageView = {
  estimatedTotal: number;
  categories: UsageCategory[];
};

function SegmentBar({ categories, total }: { categories: UsageCategory[]; total: number }) {
  const safeTotal = total > 0 ? total : 1;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
      {categories.map((c) => {
        if (c.tokens <= 0) return null;
        const pct = Math.max((c.tokens / safeTotal) * 100, c.tokens > 0 ? 1.5 : 0);
        return (
          <div
            key={c.id}
            className="h-full"
            style={{ width: `${pct}%`, backgroundColor: CATEGORY_COLORS[c.id] ?? "#64748b" }}
            title={`${c.label}: ${formatTokenCount(c.tokens)}`}
          />
        );
      })}
    </div>
  );
}

export function ContextUsageButton({ usage }: { usage: ContextUsageView | null }) {
  const [open, setOpen] = useState(false);

  if (!usage || usage.estimatedTotal <= 0) {
    return (
      <span className={cn(TRIGGER_CLASS, "text-muted-foreground/50 cursor-default")} title="Context usage">
        <Chart width={14} height={14} weight="BoldDuotone" className="shrink-0 opacity-60" />
        <span className="leading-tight">Context</span>
        <span className="tabular-nums text-muted-foreground/40">—</span>
      </span>
    );
  }

  const content = (
    <div className="w-[260px] rounded-xl border border-border bg-popover p-3 shadow-lg shadow-black/40">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-foreground">Context usage</span>
        <span className="text-xs tabular-nums text-muted-foreground">~{formatTokenCount(usage.estimatedTotal)} tokens</span>
      </div>
      <SegmentBar categories={usage.categories} total={usage.estimatedTotal} />
      <ul className="mt-3 m-0 flex list-none flex-col gap-1.5 p-0">
        {usage.categories.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 text-[12px]">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="inline-block size-2 shrink-0 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[c.id] ?? "#64748b" }} />
              {c.label}
            </span>
            <span className="tabular-nums text-foreground">~{formatTokenCount(c.tokens)}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      placement="topLeft"
      arrow={false}
      open={open}
      onOpenChange={setOpen}
      styles={{
        container: { padding: 0, background: "transparent", boxShadow: "none" },
      }}
    >
      <button
        type="button"
        className={cn(TRIGGER_CLASS, open ? "bg-border/70 text-foreground" : "text-muted-foreground hover:bg-border/60 hover:text-foreground")}
        title="Context usage"
      >
        <Chart width={14} height={14} weight="BoldDuotone" className="shrink-0" />
        <span className="leading-tight">Context</span>
        <span className="tabular-nums">~{formatTokenCount(usage.estimatedTotal)}</span>
      </button>
    </Popover>
  );
}

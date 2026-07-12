// ─── Tools Page ──────────────────────────────────────────────────────────────
// Route: /tools — Full tools management page with table view.
// Click on a tool → navigates to /tools/:id (separate page, not dialog).

import { AddCircle, Bolt, Magnifier } from "@solar-icons/react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AgentTool } from "src/common/types";
import RenderIf from "src/components/ui/RenderIf";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { fetchTools } from "./common/toolsSlice";
import { AddToolPopover } from "./components/AddToolDialog";
import { ToolTableRow } from "./components/ToolGridItem";

type ToolTab = "custom" | "builtin";

export default function ToolsPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const tools = useAppSelector((s) => s.tools.items) as AgentTool[];

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<ToolTab>("custom");

  useEffect(() => {
    dispatch(fetchTools());
  }, [dispatch]);

  const filteredTools = useMemo(() => {
    if (!search.trim()) return tools;
    const q = search.trim().toLowerCase();
    return tools.filter(
      (t) => (t.label ?? "").toLowerCase().includes(q) || (t.name ?? "").toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q),
    );
  }, [tools, search]);

  const customTools = useMemo(
    () => filteredTools.filter((t) => !t.id.startsWith("builtin:")).sort((a, b) => (a.label ?? "").localeCompare(b.label ?? "")),
    [filteredTools],
  );
  const builtinTools = useMemo(
    () => filteredTools.filter((t) => t.id.startsWith("builtin:")).sort((a, b) => (a.label ?? "").localeCompare(b.label ?? "")),
    [filteredTools],
  );

  const visibleTools = activeTab === "custom" ? customTools : builtinTools;

  const handleToolClick = (toolId: string) => {
    navigate(`/tools/${toolId}`);
  };

  const tabs: { key: ToolTab; label: string; count: number }[] = [
    { key: "custom", label: "Custom Tools", count: customTools.length },
    { key: "builtin", label: "Built-in Tools", count: builtinTools.length },
  ];

  return (
    <div className="py-8 px-10">
      <div className="flex items-start justify-between mb-8 max-w-6xl mx-auto">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-primary/10 text-primary">
            <Bolt width={22} height={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-main m-0 leading-tight">Tools</h1>
            <p className="text-sm text-muted mt-1">
              Manage your agent tools
              <span className="inline-flex items-center ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary">{tools.length}</span>
            </p>
          </div>
        </div>
        <AddToolPopover onCreated={(id) => navigate(`/tools/${id}`)}>
          <Button variant="primary" size="md" icon={<AddCircle width={16} height={16} />}>
            New Tool
          </Button>
        </AddToolPopover>
      </div>

      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-surface-raised/60">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={[
                  "relative flex items-center gap-2 px-3.5 py-1.5 rounded-md text-[13px] font-semibold transition-all duration-150 cursor-pointer",
                  activeTab === tab.key ? "bg-surface text-main shadow-sm" : "text-muted hover:text-main",
                ].join(" ")}
              >
                {tab.label}
                <span
                  className={[
                    "text-[10px] font-bold py-0.5 px-1.5 rounded-full",
                    activeTab === tab.key ? "bg-primary/15 text-primary" : "bg-surface-raised text-muted",
                  ].join(" ")}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="relative max-w-[300px] w-full">
            <Magnifier width={16} height={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none z-[1]" />
            <Input placeholder="Search tools…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>

        <RenderIf condition={visibleTools.length > 0}>
          <div className="rounded-xl border border-border/60 overflow-hidden">
            <div className="flex items-center gap-4 px-4 py-2.5 bg-surface-raised/40 border-b border-border/40">
              <div className="w-8 shrink-0" />
              <span className="flex-1 text-[11px] font-semibold text-muted uppercase tracking-wider">Name</span>
              <span className="shrink-0 text-[11px] font-semibold text-muted uppercase tracking-wider w-20 text-right">Params</span>
              <span className="shrink-0 text-[11px] font-semibold text-muted uppercase tracking-wider w-24 text-right">Status</span>
            </div>
            {visibleTools.map((tool) => (
              <ToolTableRow key={tool.id} tool={tool} onClick={activeTab === "custom" ? () => handleToolClick(tool.id) : undefined} />
            ))}
          </div>
        </RenderIf>

        <RenderIf condition={visibleTools.length === 0}>
          <div className="flex flex-col items-center justify-center py-20 px-5">
            <div className="w-14 h-14 rounded-2xl bg-surface-raised flex items-center justify-center mb-4">
              <Bolt width={24} height={24} className="text-muted" />
            </div>
            <RenderIf
              condition={search.trim().length > 0}
              fallback={
                <div className="text-center">
                  <p className="text-sm font-semibold text-main mb-1">{activeTab === "custom" ? "No custom tools yet" : "No built-in tools"}</p>
                  <p className="text-xs text-muted">{activeTab === "custom" ? "Create your first tool to get started." : "No built-in tools available."}</p>
                </div>
              }
            >
              <div className="text-center">
                <p className="text-sm font-semibold text-main mb-1">No results</p>
                <p className="text-xs text-muted">No tools matching "{search}"</p>
              </div>
            </RenderIf>
          </div>
        </RenderIf>
      </div>
    </div>
  );
}

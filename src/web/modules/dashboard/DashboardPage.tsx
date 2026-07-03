// ─── Dashboard Page ─────────────────────────────────────────────────────────
// Route: / — Welcome + stats overview.

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { Agent, AgentTool } from "src/common/types";
import { AppLogo } from "src/components/AppLogo";
import { fetchAgents } from "src/modules/agents/common/agentsSlice";
import { fetchTeams } from "src/modules/teams/common/teamsSlice";
import type { TeamWithMembers } from "src/modules/teams/common/teamsSlice";
import { fetchTools } from "src/modules/tools/common/toolsSlice";
import { useAppDispatch, useAppSelector } from "src/store/store";

// ─── Decorative grid dots ───────────────────────────────────────────────────

const LIT = new Set([0, 3, 5, 7, 10, 13, 14, 17, 19, 22]);
const DOTS = Array.from({ length: 24 }, (_, i) => ({ key: `d${i}`, lit: LIT.has(i) }));

// ─── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({ label, value, color, onClick }: { label: string; value: number; color: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      className="flex flex-col gap-2 p-5 bg-surface border border-border rounded-xl text-left cursor-pointer transition-all duration-200 hover:border-border-hover hover:bg-surface-raised"
      onClick={onClick}
    >
      <div className="flex items-center justify-between w-full">
        <span className="text-sm font-medium text-soft">{label}</span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: color }}>
          <span className="text-xs font-bold text-main">#</span>
        </div>
      </div>
      <span className="text-3xl font-bold text-main leading-none">{value}</span>
    </button>
  );
}

// ─── Dashboard Page ─────────────────────────────────────────────────────────

export default function DashboardPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const agents = useAppSelector((s) => s.agents.items) as Agent[];
  const teams = useAppSelector((s) => s.teams.teams) as TeamWithMembers[];
  const tools = useAppSelector((s) => s.tools.items) as AgentTool[];

  useEffect(() => {
    dispatch(fetchAgents());
    dispatch(fetchTeams());
    dispatch(fetchTools());
  }, [dispatch]);

  return (
    <div className="py-8 px-10 max-w-6xl mx-auto">
      {/* Welcome */}
      <div className="mb-8 flex items-center gap-4">
        <AppLogo size={40} />
        <div>
          <h1 className="text-2xl font-bold text-main m-0 leading-[1.2]">Welcome back</h1>
          <p className="text-sm text-muted mt-1">Here's an overview of your workspace</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 max-md:grid-cols-1 gap-4 mb-8">
        <StatCard label="Agents" value={agents.length} color="rgba(168,255,83,0.15)" onClick={() => navigate("/agents")} />
        <StatCard label="Teams" value={teams.length} color="rgba(156,154,242,0.15)" onClick={() => navigate("/agents")} />
        <StatCard label="Tools" value={tools.length} color="rgba(215,217,221,0.15)" onClick={() => navigate("/tools")} />
      </div>
      {/* Decorative grid */}
      <div className="border border-border/50 rounded-xl p-6 bg-surface/50 flex items-center gap-6">
        <div className="grid grid-cols-6 gap-1.5 opacity-20 shrink-0">
          {DOTS.map((dot) => (
            <div key={dot.key} className="w-2.5 h-2.5 rounded-sm" style={{ background: dot.lit ? "#a8ff53" : "rgba(255,255,255,0.06)" }} />
          ))}
        </div>
        <div>
          <p className="text-sm text-soft font-medium">Build, connect, and automate</p>
          <p className="text-[12px] text-muted mt-1">Create agents with tools, schedule tasks, and let them collaborate in teams.</p>
        </div>
      </div>
    </div>
  );
}

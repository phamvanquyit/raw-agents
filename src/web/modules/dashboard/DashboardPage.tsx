import { AddCircle, AltArrowRight } from "@solar-icons/react";
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Agent } from "src/common/types";
import { AppLogo } from "src/components/AppLogo";
import { PageShell } from "src/components/PageShell";
import RenderIf from "src/components/ui/RenderIf";
import { Badge } from "src/components/ui/badge";
import { Button } from "src/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "src/components/ui/empty";
import { fetchAgents } from "src/modules/agents/common/agentsSlice";
import { NewAgentPopover } from "src/modules/agents/components/NewAgentDialog";
import { fetchTeams } from "src/modules/teams/common/teamsSlice";
import { useAppDispatch, useAppSelector } from "src/store/store";

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function AgentRow({ agent, onOpen }: { agent: Agent; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors duration-150 hover:bg-muted cursor-pointer"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-brand">
        <AppLogo size={18} />
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-base font-medium text-foreground">{agent.name}</span>
        <RenderIf condition={agent.isPublic}>
          <Badge variant="secondary" className="rounded-md px-1.5 text-xs text-success">
            Published
          </Badge>
        </RenderIf>
      </div>
      <AltArrowRight
        width={14}
        height={14}
        className="shrink-0 -translate-x-1 text-quaternary-foreground opacity-0 transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-hover:text-sidebar-accent-foreground"
      />
    </button>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const user = useAppSelector((s) => s.auth.user);
  const agents = useAppSelector((s) => s.agents.items) as Agent[];

  useEffect(() => {
    dispatch(fetchAgents());
    dispatch(fetchTeams());
  }, [dispatch]);

  const displayName = user?.name || user?.username || "there";
  const greeting = greetingForHour(new Date().getHours());

  const recentAgents = useMemo(() => {
    return [...agents]
      .sort((a, b) => {
        const da = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const db = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return db - da;
      })
      .slice(0, 8);
  }, [agents]);

  return (
    <PageShell contentClassName="max-w-2xl">
      <header className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="m-0 text-2xl font-semibold leading-tight text-foreground">
            {greeting}, {displayName}
          </h1>
          <p className="mt-1.5 m-0 text-sm text-muted-foreground">{agents.length === 0 ? "Create an agent to get started." : "Pick up where you left off."}</p>
        </div>
        <NewAgentPopover>
          <Button variant="primary" icon={<AddCircle width={16} height={16} />}>
            New agent
          </Button>
        </NewAgentPopover>
      </header>

      <RenderIf
        condition={recentAgents.length > 0}
        fallback={
          <Empty className="border border-border-subtle bg-card p-10">
            <EmptyHeader>
              <EmptyTitle>No agents yet</EmptyTitle>
              <EmptyDescription>Create your first agent to start building.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <NewAgentPopover>
                <Button variant="primary" size="sm" icon={<AddCircle width={14} height={14} />}>
                  Create agent
                </Button>
              </NewAgentPopover>
            </EmptyContent>
          </Empty>
        }
      >
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="m-0 text-sm font-medium text-muted-foreground">Recent agents</h2>
            <button
              type="button"
              onClick={() => navigate("/agents")}
              className="border-0 bg-transparent p-0 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-sidebar-accent-foreground cursor-pointer"
            >
              View all
            </button>
          </div>
          <div className="rounded-xl border border-border-subtle bg-card p-1.5">
            {recentAgents.map((agent) => (
              <AgentRow key={agent.id} agent={agent} onOpen={() => navigate(`/agents/${agent.id}`)} />
            ))}
          </div>
        </section>
      </RenderIf>
    </PageShell>
  );
}

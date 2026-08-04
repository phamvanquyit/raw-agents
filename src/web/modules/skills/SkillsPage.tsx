import { AddCircle, Magnifier } from "@solar-icons/react";
import { Button, Input } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Skill } from "src/common/types";
import { PageShell } from "src/components/PageShell";
import RenderIf from "src/components/RenderIf";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { NewSkillDialog } from "./components/NewSkillDialog";
import { SkillsEmptyState } from "./components/SkillsEmptyState";
import { SkillsTable } from "./components/SkillsTable";
import { fetchSkills } from "./common/skillsSlice";

export default function SkillsPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const items = useAppSelector((s) => s.skills.items) as Skill[];
  const [query, setQuery] = useState("");

  useEffect(() => {
    dispatch(fetchSkills());
  }, [dispatch]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
  }, [items, query]);

  return (
    <PageShell>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="m-0 text-xl font-semibold leading-tight text-foreground">Skills</h1>
          <p className="m-0 mt-1.5 text-sm text-muted-foreground">
            Shared instructions agents can load on demand
            <RenderIf condition={items.length > 0}>
              <span className="ml-2 inline-flex items-center rounded-full bg-edge-skill/12 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-edge-skill">
                {items.length}
              </span>
            </RenderIf>
          </p>
        </div>
        <NewSkillDialog>
          <Button type="primary" icon={<AddCircle width={16} height={16} weight="BoldDuotone" />}>
            New skill
          </Button>
        </NewSkillDialog>
      </div>

      <RenderIf condition={items.length > 0}>
        <div className="mb-4">
          <Input
            allowClear
            prefix={<Magnifier width={14} height={14} className="text-muted-foreground" />}
            placeholder="Search skills…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-sm"
          />
        </div>
      </RenderIf>

      <RenderIf condition={items.length === 0}>
        <SkillsEmptyState />
      </RenderIf>

      <RenderIf condition={items.length > 0 && filtered.length === 0}>
        <p className="m-0 py-12 text-center text-sm text-muted-foreground">No matches</p>
      </RenderIf>

      <RenderIf condition={filtered.length > 0}>
        <SkillsTable skills={filtered} onNavigate={(id) => navigate(`/skills/${id}`)} />
      </RenderIf>
    </PageShell>
  );
}

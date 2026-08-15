import FaceScanSquare from "@solar-icons/react/faces/FaceScanSquare";
import Magnifier from "@solar-icons/react/search/Magnifier";
import UsersGroupTwoRounded from "@solar-icons/react/users/UsersGroupTwoRounded";
import { Checkbox, Form, Input, Modal } from "antd";
import { useEffect, useMemo, useState } from "react";
import { apiClient } from "src/common/api";
import type { AgentListItem, AgentTeam, ApiKey } from "src/common/types";
import { UserAvatar } from "src/components/UserAvatar";

interface ApiKeyFormDialogProps {
  edit?: ApiKey | null;
  agents: AgentListItem[];
  onClose: () => void;
  onCreated: (key: ApiKey) => void;
  onUpdated: (key: ApiKey) => void;
}

interface AgentGroup {
  id: string | null;
  name: string;
  agents: AgentListItem[];
}

function toggleIds(current: string[], ids: string[], checked: boolean): string[] {
  const next = new Set(current);
  for (const id of ids) {
    if (checked) next.add(id);
    else next.delete(id);
  }
  return [...next];
}

export function ApiKeyFormDialog({ edit, agents, onClose, onCreated, onUpdated }: ApiKeyFormDialogProps) {
  const isEdit = !!edit;
  const [name, setName] = useState(edit?.name ?? "");
  const [agentIds, setAgentIds] = useState<string[]>(edit?.agentIds ?? []);
  const [teams, setTeams] = useState<AgentTeam[]>([]);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setName(edit?.name ?? "");
    setAgentIds(edit?.agentIds ?? []);
    setQuery("");
    setError("");
  }, [edit]);

  useEffect(() => {
    void apiClient
      .get<{ items: AgentTeam[] }>("/api/teams")
      .then((res) => setTeams(res.items))
      .catch(() => setTeams([]));
  }, []);

  const groups = useMemo<AgentGroup[]>(() => {
    const q = query.trim().toLowerCase();
    const visible = q ? agents.filter((a) => a.name.toLowerCase().includes(q)) : agents;
    const byTeam = new Map<string, AgentListItem[]>();
    const ungrouped: AgentListItem[] = [];
    for (const agent of visible) {
      if (agent.teamId) {
        const list = byTeam.get(agent.teamId) ?? [];
        list.push(agent);
        byTeam.set(agent.teamId, list);
      } else {
        ungrouped.push(agent);
      }
    }

    const named: AgentGroup[] = [...teams]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((team) => ({
        id: team.id,
        name: team.name,
        agents: (byTeam.get(team.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .filter((group) => group.agents.length > 0);

    const orphaned = [...byTeam.entries()].filter(([teamId]) => !teams.some((team) => team.id === teamId)).flatMap(([, list]) => list);
    const leftover = [...ungrouped, ...orphaned].sort((a, b) => a.name.localeCompare(b.name));
    if (leftover.length > 0) {
      named.push({ id: null, name: "Ungrouped", agents: leftover });
    }
    return named;
  }, [agents, teams, query]);

  const selected = useMemo(() => new Set(agentIds), [agentIds]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Please enter a name");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (isEdit && edit) {
        const updated = await apiClient.put<ApiKey>(`/api/api-keys/${edit.id}`, { name: name.trim(), agentIds });
        onUpdated(updated);
      } else {
        const created = await apiClient.post<ApiKey>("/api/api-keys", { name: name.trim(), agentIds });
        onCreated(created);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={isEdit ? "Edit API key" : "New API key"}
      onCancel={onClose}
      onOk={() => void handleSubmit()}
      okText={isEdit ? "Save" : "Create"}
      confirmLoading={saving}
      destroyOnHidden
      width={520}
    >
      <div className="flex flex-col gap-4 pt-2">
        <Form.Item label={<span className="text-muted-foreground">Name</span>} className="!mb-0" layout="vertical">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Production bot" autoComplete="off" />
        </Form.Item>
        <Form.Item label={<span className="text-muted-foreground">Agents</span>} className="!mb-0" layout="vertical">
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border p-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search agents"
                allowClear
                prefix={<Magnifier width={14} height={14} className="text-muted-foreground" />}
              />
              <span className="shrink-0 text-[11px] tabular-nums text-tertiary-foreground">{agentIds.length} selected</span>
            </div>
            <div className="max-h-[320px] overflow-y-auto py-1">
              {groups.length === 0 ? (
                <p className="m-0 px-3 py-8 text-center text-sm text-muted-foreground">{agents.length === 0 ? "No agents yet" : "No agents match"}</p>
              ) : (
                groups.map((group) => {
                  const ids = group.agents.map((a) => a.id);
                  const checkedCount = ids.filter((id) => selected.has(id)).length;
                  const allChecked = checkedCount === ids.length;
                  const someChecked = checkedCount > 0 && !allChecked;
                  const GroupIcon = group.id ? UsersGroupTwoRounded : FaceScanSquare;
                  return (
                    <div key={group.id ?? "__ungrouped"} className="pb-1">
                      <div
                        className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-muted/40"
                        onClick={() => setAgentIds((prev) => toggleIds(prev, ids, !allChecked))}
                      >
                        <Checkbox
                          checked={allChecked}
                          indeterminate={someChecked}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setAgentIds((prev) => toggleIds(prev, ids, e.target.checked))}
                        />
                        <GroupIcon width={14} height={14} className="shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{group.name}</span>
                        <span className="text-[11px] tabular-nums text-tertiary-foreground">
                          {checkedCount}/{ids.length}
                        </span>
                      </div>
                      {group.agents.map((agent) => {
                        const checked = selected.has(agent.id);
                        return (
                          <div
                            key={agent.id}
                            className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 pl-8 hover:bg-muted/40"
                            onClick={() => setAgentIds((prev) => toggleIds(prev, [agent.id], !checked))}
                          >
                            <Checkbox
                              checked={checked}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setAgentIds((prev) => toggleIds(prev, [agent.id], e.target.checked))}
                            />
                            <UserAvatar avatar={agent.avatar} name={agent.name} size={22} className="shrink-0" />
                            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">{agent.name}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </Form.Item>
        {error ? <div className="text-[12px] font-medium text-destructive">{error}</div> : null}
      </div>
    </Modal>
  );
}

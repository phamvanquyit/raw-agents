import { AddCircle } from "@solar-icons/react";
import { Button, Form, Input, Popover, Select } from "antd";
import type { InputRef } from "antd";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { AgentTeam } from "src/common/types";
import { ModelPicker } from "src/components/ModelPicker";
import { genConfig } from "src/components/UserAvatar";
import { createAgent, fetchAgents } from "src/modules/agents/common/agentsSlice";

import { fetchTeams } from "src/modules/teams/common/teamsSlice";
import type { TeamWithMembers } from "src/modules/teams/common/teamsSlice";
import { useAppDispatch, useAppSelector } from "src/store/store";

interface NewAgentPopoverProps {
  defaultTeamId?: string | null;
  children: ReactNode;
}

export function NewAgentPopover({ defaultTeamId, children }: NewAgentPopoverProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [aiModel, setAiModel] = useState("");
  const [teamId, setTeamId] = useState<string>(defaultTeamId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const dispatch = useAppDispatch();
  const nameRef = useRef<InputRef>(null);

  const teams = useAppSelector((s) => s.teams.teams) as TeamWithMembers[];

  useEffect(() => {
    if (open) {
      setName("");
      setSelectedProviderId(null);
      setAiModel("");
      setTeamId(defaultTeamId ?? "");
      setError("");

      dispatch(fetchTeams());
      setTimeout(() => nameRef.current?.focus(), 150);
    }
  }, [open, dispatch, defaultTeamId]);

  const handleModelChange = (providerId: string, model: string) => {
    setSelectedProviderId(providerId);
    setAiModel(model);
    if (error) setError("");
  };

  const handleTeamChange = (value: string) => {
    setTeamId(value);
    if (error) setError("");
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Please enter an agent name");
      nameRef.current?.focus();
      return;
    }
    if (!aiModel) {
      setError("Please select a model");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await dispatch(
        createAgent({
          name: name.trim(),
          avatar: JSON.stringify(genConfig()),
          aiProvider: selectedProviderId,
          aiModel,
          ...(teamId ? { teamId } : {}),
        }),
      ).unwrap();
      await dispatch(fetchAgents());
      await dispatch(fetchTeams());
      setOpen(false);
    } catch {
      setError("Failed to create agent");
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleCreate();
    }
  };

  const teamOptions = [{ value: "", label: "No team" }, ...teams.map((t: AgentTeam) => ({ value: t.id, label: t.name }))];

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomRight"
      arrow
      styles={{ root: { width: 420 }, container: { width: 420, padding: 0 } }}
      content={
        <div className="w-[420px]">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <AddCircle width={16} height={16} className="text-primary shrink-0" />
            <span className="text-sm font-semibold text-foreground">New Agent</span>
          </div>

          <div className="flex flex-col gap-3.5 p-4">
            <Form.Item
              label={
                <span className="text-muted-foreground">
                  Agent Name<span className="text-destructive"> *</span>
                </span>
              }
              className="!mb-0"
              layout="vertical"
            >
              <Input
                ref={nameRef}
                id="new-agent-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError("");
                }}
                onKeyDown={handleKeyDown}
                placeholder="e.g. Research Bot, Support Agent…"
                autoComplete="off"
              />
            </Form.Item>

            <Form.Item label={<span className="text-muted-foreground">Team</span>} className="!mb-0" layout="vertical">
              <Select value={teamId} onChange={handleTeamChange} options={teamOptions} placeholder="Select team…" className="w-full" />
            </Form.Item>

            <Form.Item
              label={
                <span className="text-muted-foreground">
                  Model<span className="text-destructive"> *</span>
                </span>
              }
              className="!mb-0"
              layout="vertical"
            >
              <ModelPicker selectedProviderId={selectedProviderId} selectedModel={aiModel} onChange={handleModelChange} />
            </Form.Item>

            {error && <div className="text-[12px] text-destructive font-medium">{error}</div>}
          </div>

          <div className="flex justify-end gap-2.5 px-4 py-3 border-t border-border">
            <Button type="text" size="small" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="primary" size="small" loading={saving} onClick={handleCreate}>
              {saving ? "Creating…" : "Create Agent"}
            </Button>
          </div>
        </div>
      }
    >
      {children}
    </Popover>
  );
}

export { NewAgentPopover as NewAgentDialog };

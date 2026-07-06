import { AddCircle } from "@solar-icons/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { AgentTeam } from "src/common/types";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Field } from "src/components/ui/label";
import { ModelPicker } from "src/components/ui/model-picker";
import { Popover, PopoverContent, PopoverTrigger } from "src/components/ui/popover";
import { Select } from "src/components/ui/select";
import { Textarea } from "src/components/ui/textarea";
import { createAgent, fetchAgents } from "src/modules/agents/common/agentsSlice";

import { fetchTeams } from "src/modules/teams/common/teamsSlice";
import type { TeamWithMembers } from "src/modules/teams/common/teamsSlice";
import { useAppDispatch, useAppSelector } from "src/store/store";

// ─── New Agent Popover ──────────────────────────────────────────────────────

interface NewAgentPopoverProps {
  defaultTeamId?: string | null;
  children: ReactNode;
}

export function NewAgentPopover({ defaultTeamId, children }: NewAgentPopoverProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [aiModel, setAiModel] = useState("");
  const [teamId, setTeamId] = useState<string>(defaultTeamId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const dispatch = useAppDispatch();
  const nameRef = useRef<HTMLInputElement>(null);

  const teams = useAppSelector((s) => s.teams.teams) as TeamWithMembers[];

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
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
          description: description.trim() || null,
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

  // Build team options — no inline create, teams are managed on /teams page
  const teamOptions = [{ value: "", label: "No team" }, ...teams.map((t: AgentTeam) => ({ value: t.id, label: t.name }))];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[420px] p-0">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <AddCircle width={16} height={16} className="text-primary shrink-0" />
          <span className="text-sm font-semibold text-main">New Agent</span>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-3.5 p-4">
          <Field label="Agent Name" required>
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
          </Field>

          <Field label="Description">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description of what this agent does"
              autoHeight
              rows={2}
            />
          </Field>

          {/* Team selector */}
          <Field label="Team">
            <Select value={teamId} onChange={handleTeamChange} options={teamOptions} placeholder="Select team…" />
          </Field>

          {/* Model (Provider + Model combined) */}
          <Field label="Model" required>
            <ModelPicker selectedProviderId={selectedProviderId} selectedModel={aiModel} onChange={handleModelChange} />
          </Field>

          {error && <div className="text-[12px] text-[#a03030] font-medium">{error}</div>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2.5 px-4 py-3 border-t border-border">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" loading={saving} onClick={handleCreate}>
            {saving ? "Creating…" : "Create Agent"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Keep backward-compatible named export
export { NewAgentPopover as NewAgentDialog };

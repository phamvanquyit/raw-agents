import { AddCircle, PenNewSquare } from "@solar-icons/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "src/components/ui/button";
import { SimpleDialog } from "src/components/ui/dialog";
import { Field } from "src/components/ui/form-field";
import { Input } from "src/components/ui/input";
import { Textarea } from "src/components/ui/textarea";
import { toast } from "src/components/ui/toast";
import { createTeam, updateTeam } from "src/modules/teams/common/teamsSlice";
import type { TeamWithMembers } from "src/modules/teams/common/teamsSlice";
import { useAppDispatch } from "src/store/store";

interface TeamDialogProps {
  open: boolean;
  onClose: () => void;
  team?: TeamWithMembers | null;
}

export function TeamDialog({ open, onClose, team }: TeamDialogProps) {
  const dispatch = useAppDispatch();
  const isEdit = !!team;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(team?.name ?? "");
      setDescription(team?.description ?? "");
      setSaving(false);
      setTimeout(() => nameRef.current?.focus(), 150);
    }
  }, [open, team]);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (isEdit && team) {
        await dispatch(updateTeam({ id: team.id, name: name.trim(), description: description.trim() || undefined })).unwrap();
        toast.success("Team updated");
      } else {
        await dispatch(createTeam({ name: name.trim(), description: description.trim() || undefined })).unwrap();
        toast.success("Team created");
      }
      onClose();
    } catch {
      toast.error(isEdit ? "Failed to update team" : "Failed to create team");
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <SimpleDialog
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit Team" : "New Team"}
      icon={isEdit ? <PenNewSquare width={16} height={16} /> : <AddCircle width={16} height={16} />}
      width={420}
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" loading={saving} onClick={handleSubmit} disabled={!name.trim()}>
            {saving ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save" : "Create Team"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 pt-4">
        <Field label="Team Name" required>
          <Input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. Backend Team, QA…"
            autoComplete="off"
          />
        </Field>
        <Field label="Description" optional>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description of this team" rows={2} />
        </Field>
      </div>
    </SimpleDialog>
  );
}

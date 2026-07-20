import { PenNewSquare } from "@solar-icons/react";
import { useEffect, useRef, useState } from "react";
import { DeleteConfirmButton } from "src/components/ui/alert-dialog";
import { Button } from "src/components/ui/button";
import { SimpleDialog } from "src/components/ui/dialog";
import { Field } from "src/components/ui/form-field";
import { Input } from "src/components/ui/input";
import { toast } from "src/components/ui/toast";
import { deleteTeam, updateTeam } from "src/modules/teams/common/teamsSlice";
import type { TeamWithMembers } from "src/modules/teams/common/teamsSlice";
import { useAppDispatch } from "src/store/store";

interface EditTeamDialogProps {
  open: boolean;
  team: TeamWithMembers | null;
  onClose: () => void;
}

export function EditTeamDialog({ open, team, onClose }: EditTeamDialogProps) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const dispatch = useAppDispatch();
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && team) {
      setName(team.name);
      setError("");
      setTimeout(() => nameRef.current?.focus(), 150);
    }
  }, [open, team]);

  const handleSave = async () => {
    if (!team) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please enter a team name");
      nameRef.current?.focus();
      return;
    }
    if (trimmed === team.name) {
      onClose();
      return;
    }
    setSaving(true);
    setError("");
    try {
      await dispatch(updateTeam({ id: team.id, name: trimmed })).unwrap();
      toast.success("Team updated successfully");
      onClose();
    } catch {
      toast.error("Failed to update team name");
      setError("Failed to update team name");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!team) return;
    setDeleting(true);
    setError("");
    try {
      await dispatch(deleteTeam(team.id)).unwrap();
      toast.success("Team deleted successfully");
      onClose();
    } catch {
      toast.error("Failed to delete team");
      setError("Failed to delete team");
    } finally {
      setDeleting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSave();
    }
  };

  if (!open || !team) return null;

  return (
    <SimpleDialog
      open
      onClose={onClose}
      title="Edit Team"
      icon={<PenNewSquare size={18} />}
      width={420}
      top={20}
      footer={
        <div className="flex flex-row gap-3">
          <div className="mr-auto">
            <DeleteConfirmButton
              label="Delete team?"
              description="Are you sure? This cannot be undone."
              onConfirm={handleDelete}
              disabled={deleting}
              size="sm"
            />
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" loading={saving} onClick={handleSave}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Team Name" required>
          <Input
            ref={nameRef}
            id="canvas-edit-team-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError("");
            }}
            onKeyDown={handleKeyDown}
            placeholder="e.g. Marketing, Engineering, Research…"
            autoComplete="off"
          />
        </Field>

        {error && <div className="text-[12px] text-destructive font-medium">{error}</div>}
      </div>
    </SimpleDialog>
  );
}

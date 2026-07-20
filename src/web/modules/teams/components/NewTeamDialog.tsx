import { ArrowRight, UsersGroupTwoRounded } from "@solar-icons/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "src/components/ui/button";
import { SimpleDialog } from "src/components/ui/dialog";
import { Field } from "src/components/ui/form-field";
import { Input } from "src/components/ui/input";
import { createTeam } from "src/modules/teams/common/teamsSlice";
import { useAppDispatch } from "src/store/store";

export function NewTeamDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dispatch = useAppDispatch();
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setError("");
      setTimeout(() => nameRef.current?.focus(), 150);
    }
  }, [open]);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Please enter a team name");
      nameRef.current?.focus();
      return;
    }
    setSaving(true);
    setError("");
    try {
      await dispatch(
        createTeam({
          name: name.trim(),
        }),
      ).unwrap();
      setOpen(false);
    } catch {
      setError("Failed to create team");
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

  const handleClose = () => setOpen(false);

  return (
    <>
      {/* Trigger button */}
      <Button id="canvas-new-team-btn" variant="primary" size="sm" icon={<UsersGroupTwoRounded width={13} height={13} />} onClick={() => setOpen(true)}>
        New Team
      </Button>

      {/* Dialog */}
      {open && (
        <SimpleDialog
          open
          onClose={handleClose}
          title="New Team"
          icon={<UsersGroupTwoRounded size={18} />}
          width={420}
          top={20}
          footer={
            <div className="flex flex-row justify-end gap-3">
              <Button variant="ghost" size="sm" onClick={handleClose}>
                Cancel
              </Button>

              <Button variant="primary" size="sm" loading={saving} onClick={handleCreate} icon={!saving ? <ArrowRight size={13} /> : undefined}>
                {saving ? "Creating…" : "Create Team"}
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-4">
            <Field label="Team Name" required>
              <Input
                ref={nameRef}
                id="canvas-new-team-name"
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
      )}
    </>
  );
}

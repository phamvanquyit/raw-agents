import { ArrowRight, UsersGroupTwoRounded } from "@solar-icons/react";
import { Button, Form, Input, Modal } from "antd";
import type { InputRef } from "antd";
import { useEffect, useRef, useState } from "react";
import { createTeam } from "src/modules/teams/common/teamsSlice";
import { useAppDispatch } from "src/store/store";

export function NewTeamDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dispatch = useAppDispatch();
  const nameRef = useRef<InputRef>(null);

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
      <Button id="canvas-new-team-btn" type="primary" size="small" icon={<UsersGroupTwoRounded width={13} height={13} />} onClick={() => setOpen(true)}>
        New Team
      </Button>

      <Modal
        open={open}
        onCancel={handleClose}
        title={
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-field-sm w-field-sm shrink-0 items-center justify-center rounded-lg bg-muted/60">
              <div className="text-[14px] leading-none text-muted-foreground">
                <UsersGroupTwoRounded size={18} />
              </div>
            </div>
            <span className="truncate font-semibold text-foreground">New Team</span>
          </div>
        }
        footer={
          <div className="flex flex-row justify-end gap-3">
            <Button type="text" size="small" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="primary" size="small" loading={saving} onClick={handleCreate} icon={!saving ? <ArrowRight size={13} /> : undefined}>
              {saving ? "Creating…" : "Create Team"}
            </Button>
          </div>
        }
        width={420}
        style={{ top: 20 }}
        centered={false}
        destroyOnHidden
      >
        <div className="flex flex-col gap-4">
          <Form.Item
            label={
              <span className="text-muted-foreground">
                Team Name<span className="text-destructive"> *</span>
              </span>
            }
            className="!mb-0"
            layout="vertical"
          >
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
          </Form.Item>

          {error && <div className="text-[12px] text-destructive font-medium">{error}</div>}
        </div>
      </Modal>
    </>
  );
}

import { UsersGroupTwoRounded } from "@solar-icons/react";
import { Button, Form, Input, Popover } from "antd";
import type { InputRef } from "antd";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { createTeam } from "src/modules/teams/common/teamsSlice";
import { useAppDispatch } from "src/store/store";

interface NewTeamPopoverProps {
  children: ReactNode;
}

export function NewTeamPopover({ children }: NewTeamPopoverProps) {
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
      await dispatch(createTeam({ name: name.trim() })).unwrap();
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

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomRight"
      arrow
      styles={{ root: { width: 360 }, container: { width: 360, padding: 0 } }}
      content={
        <div className="w-[360px]">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <UsersGroupTwoRounded width={16} height={16} className="text-primary shrink-0" />
            <span className="text-sm font-semibold text-foreground">New Team</span>
          </div>

          <div className="flex flex-col gap-3.5 p-4">
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
                id="new-team-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError("");
                }}
                onKeyDown={handleKeyDown}
                placeholder="e.g. Marketing, Engineering…"
                autoComplete="off"
              />
            </Form.Item>

            {error && <div className="text-[12px] text-destructive font-medium">{error}</div>}
          </div>

          <div className="flex justify-end gap-2.5 px-4 py-3 border-t border-border">
            <Button type="text" size="small" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="primary" size="small" loading={saving} onClick={handleCreate}>
              {saving ? "Creating…" : "Create Team"}
            </Button>
          </div>
        </div>
      }
    >
      {children}
    </Popover>
  );
}

export { NewTeamPopover as NewTeamDialog };

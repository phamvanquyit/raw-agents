import { AddCircle, PenNewSquare, TrashBinTrash } from "@solar-icons/react";
import { Button, Form, Input, Modal, message } from "antd";
import type { InputRef } from "antd";
import { useEffect, useRef, useState } from "react";
import RenderIf from "src/components/RenderIf";
import { createTeam, deleteTeam, updateTeam } from "src/modules/teams/common/teamsSlice";
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
  const [deleting, setDeleting] = useState(false);
  const nameRef = useRef<InputRef>(null);

  useEffect(() => {
    if (open) {
      setName(team?.name ?? "");
      setDescription(team?.description ?? "");
      setSaving(false);
      setDeleting(false);
      setTimeout(() => nameRef.current?.focus(), 150);
    }
  }, [open, team]);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (isEdit && team) {
        await dispatch(updateTeam({ id: team.id, name: name.trim(), description: description.trim() || undefined })).unwrap();
        message.success("Team updated");
      } else {
        await dispatch(createTeam({ name: name.trim(), description: description.trim() || undefined })).unwrap();
        message.success("Team created");
      }
      onClose();
    } catch {
      message.error(isEdit ? "Failed to update team" : "Failed to create team");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!team) return;
    setDeleting(true);
    try {
      await dispatch(deleteTeam(team.id)).unwrap();
      message.success("Team deleted");
      onClose();
    } catch {
      message.error("Failed to delete team");
    } finally {
      setDeleting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const icon = isEdit ? <PenNewSquare width={16} height={16} /> : <AddCircle width={16} height={16} />;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-field-sm w-field-sm shrink-0 items-center justify-center rounded-lg bg-muted/60">
            <div className="text-[14px] leading-none text-muted-foreground">{icon}</div>
          </div>
          <span className="truncate font-semibold text-foreground">{isEdit ? "Edit Team" : "New Team"}</span>
        </div>
      }
      footer={
        <div className="flex items-center gap-2.5">
          <RenderIf condition={isEdit}>
            <div className="mr-auto">
              <Button
                size="small"
                danger
                disabled={deleting || saving}
                icon={<TrashBinTrash size={12} />}
                onClick={() => {
                  Modal.confirm({
                    title: "Delete team?",
                    content: `Delete "${team?.name}"? Agents in this team will be unlinked.`,
                    okText: "Delete",
                    okType: "danger",
                    onOk: handleDelete,
                  });
                }}
              >
                Delete
              </Button>
            </div>
          </RenderIf>
          <Button type="text" size="small" onClick={onClose}>
            Cancel
          </Button>
          <Button type="primary" size="small" loading={saving} onClick={handleSubmit} disabled={!name.trim()}>
            {saving ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save" : "Create Team"}
          </Button>
        </div>
      }
      width={420}
      destroyOnHidden
    >
      <div className="flex flex-col gap-4 pt-4">
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
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. Backend Team, QA…"
            autoComplete="off"
          />
        </Form.Item>
        <Form.Item
          label={
            <span className="text-muted-foreground">
              Description<span className="font-normal text-muted-foreground"> (optional)</span>
            </span>
          }
          className="!mb-0"
          layout="vertical"
        >
          <Input.TextArea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description of this team" rows={2} />
        </Form.Item>
      </div>
    </Modal>
  );
}

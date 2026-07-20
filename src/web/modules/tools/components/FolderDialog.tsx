import { AddCircle, PenNewSquare } from "@solar-icons/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "src/components/ui/button";
import { SimpleDialog } from "src/components/ui/dialog";
import { Field } from "src/components/ui/form-field";
import { Input } from "src/components/ui/input";
import { toast } from "src/components/ui/toast";
import { useAppDispatch } from "src/store/store";
import { createToolFolder, updateToolFolder } from "../common/toolFoldersSlice";
import type { ToolFolderWithTools } from "../common/toolFoldersSlice";

interface FolderDialogProps {
  open: boolean;
  onClose: () => void;
  folder?: ToolFolderWithTools | null;
}

export function FolderDialog({ open, onClose, folder }: FolderDialogProps) {
  const dispatch = useAppDispatch();
  const isEdit = !!folder;
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(folder?.name ?? "");
      setSaving(false);
      setTimeout(() => nameRef.current?.focus(), 150);
    }
  }, [open, folder]);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (isEdit && folder) {
        await dispatch(updateToolFolder({ id: folder.id, name: name.trim() })).unwrap();
        toast.success("Folder updated");
      } else {
        await dispatch(createToolFolder({ name: name.trim() })).unwrap();
        toast.success("Folder created");
      }
      onClose();
    } catch {
      toast.error(isEdit ? "Failed to update folder" : "Failed to create folder");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SimpleDialog
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit Folder" : "New Folder"}
      icon={isEdit ? <PenNewSquare width={16} height={16} /> : <AddCircle width={16} height={16} />}
      width={420}
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" loading={saving} onClick={handleSubmit} disabled={!name.trim()}>
            {saving ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save" : "Create Folder"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 pt-4">
        <Field label="Folder Name" required>
          <Input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="e.g. Integrations, Scrapers…"
            autoComplete="off"
          />
        </Field>
      </div>
    </SimpleDialog>
  );
}

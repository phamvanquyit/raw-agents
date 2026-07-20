import { AltArrowLeft, Diskette, TrashBinTrash } from "@solar-icons/react";
import { Button, Modal, Switch } from "antd";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

interface EditToolHeaderProps {
  label: string;
  toolId?: string;
  isActive: boolean;
  toggling: boolean;
  deleting: boolean;
  saving: boolean;
  isDirty: boolean;
  onToggleActive: () => void;
  onDelete: () => void;
  onSave: () => void;
}

export function EditToolHeader({ label, toolId, isActive, toggling, deleting, saving, isDirty, onToggleActive, onDelete, onSave }: EditToolHeaderProps) {
  const navigate = useNavigate();

  const handleDeleteClick = () => {
    Modal.confirm({
      title: `Delete "${label || toolId}"?`,
      content: "This action cannot be undone.",
      okText: "Delete",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: onDelete,
    });
  };

  return (
    <div className="shrink-0 flex items-center gap-3 h-12 px-4 border-b border-border bg-card">
      <button
        type="button"
        onClick={() => navigate("/tools")}
        className="flex items-center justify-center size-8 rounded-md bg-transparent border border-transparent hover:bg-muted hover:border-border text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0"
        title="Back to Tools"
      >
        <AltArrowLeft width={16} height={16} />
      </button>

      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <h1 className="text-base font-semibold text-foreground truncate m-0 leading-5">{label}</h1>
        <AnimatePresence>
          {isDirty && !saving && (
            <motion.span
              initial={{ opacity: 0, x: 4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 4 }}
              className="inline-flex items-center gap-1.5 h-5 px-2 rounded-md bg-accent text-brand-soft text-xs font-medium shrink-0"
            >
              <span className="size-1.5 rounded-full bg-brand-soft animate-pulse" />
              Unsaved
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span className={["text-xs font-medium transition-colors", isActive ? "text-success" : "text-muted-foreground"].join(" ")}>
          {isActive ? "Active" : "Inactive"}
        </span>
        <Switch
          size="small"
          checked={isActive}
          loading={toggling}
          onChange={() => onToggleActive()}
          classNames={isActive ? { root: "!bg-success hover:!bg-success" } : undefined}
          aria-label={isActive ? "Deactivate" : "Activate"}
        />
      </div>

      <div className="w-px h-4 bg-border shrink-0" />

      <Button
        type="text"
        danger
        size="small"
        icon={<TrashBinTrash size={14} />}
        disabled={deleting}
        loading={deleting}
        onClick={handleDeleteClick}
        aria-label="Delete tool"
      />

      <Button
        id="shared-save-btn"
        type="primary"
        size="small"
        disabled={saving || !isDirty}
        loading={saving}
        onClick={() => onSave()}
        icon={!saving ? <Diskette size={14} /> : undefined}
      >
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}

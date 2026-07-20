// ─── Edit Tool Header ─────────────────────────────────────────────────────────
// Full-width top bar for the Edit Tool page: back nav, title, active toggle, actions.

import { AltArrowLeft, Diskette } from "@solar-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { DeleteConfirmButton } from "src/components/ui/alert-dialog";
import { Button } from "src/components/ui/button";

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

  return (
    <div className="shrink-0 flex items-center gap-3 h-[52px] px-4 border-b border-border bg-card">
      {/* Back button */}
      <button
        type="button"
        onClick={() => navigate("/tools")}
        className="flex items-center justify-center w-8 h-8 rounded-lg bg-transparent border border-transparent hover:bg-muted hover:border-border text-muted-foreground hover:text-foreground transition-all duration-150 cursor-pointer shrink-0"
        title="Back to Tools"
      >
        <AltArrowLeft width={16} height={16} />
      </button>

      {/* Separator */}
      <div className="w-px h-5 bg-border shrink-0" />

      {/* Tool name + unsaved indicator */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <h1 className="text-sm font-semibold text-foreground truncate m-0 leading-tight">{label}</h1>
        <AnimatePresence>
          {isDirty && !saving && (
            <motion.span
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 6 }}
              className="flex items-center gap-1.5 text-[10px] font-semibold text-primary/70 shrink-0"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block animate-pulse" />
              Unsaved
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Active toggle */}
      <button
        type="button"
        onClick={onToggleActive}
        disabled={toggling}
        className="flex items-center gap-2 cursor-pointer border-0 bg-transparent shrink-0"
        aria-checked={isActive}
        role="switch"
      >
        <span className={["text-[11px] font-semibold transition-colors", isActive ? "text-primary" : "text-muted-foreground"].join(" ")}>
          {isActive ? "Active" : "Inactive"}
        </span>
        <div
          className={["relative w-9 h-5 rounded-full transition-colors duration-200", isActive ? "bg-primary" : "bg-muted", toggling ? "opacity-60" : ""].join(
            " ",
          )}
        >
          <div
            className={[
              "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-transform duration-200",
              isActive ? "translate-x-4" : "translate-x-0",
            ].join(" ")}
          />
        </div>
      </button>

      {/* Separator */}
      <div className="w-px h-5 bg-border shrink-0" />

      {/* Delete */}
      <DeleteConfirmButton label={`Delete "${label || toolId}"?`} description="This action cannot be undone." disabled={deleting} onConfirm={onDelete} />

      {/* Save */}
      <Button
        id="shared-save-btn"
        variant="primary"
        size="sm"
        disabled={saving || !isDirty}
        loading={saving}
        onClick={() => onSave()}
        icon={!saving ? <Diskette className="w-3 h-3" /> : undefined}
      >
        {saving ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}

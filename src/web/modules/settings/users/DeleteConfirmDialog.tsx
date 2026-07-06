import { TrashBinMinimalistic } from "@solar-icons/react";
import { useState } from "react";
import { apiClient } from "src/common/api";
import type { User } from "src/common/types";
import { Button } from "src/components/ui/button";
import { SimpleDialog } from "src/components/ui/dialog";
import { toast } from "src/components/ui/toast";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DeleteConfirmProps {
  user: User;
  onClose: () => void;
  onDeleted: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DeleteConfirmDialog({ user, onClose, onDeleted }: DeleteConfirmProps) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await apiClient.delete(`/api/users/${user.id}`);
      toast.success(`Deleted user ${user.username}`);
      onDeleted();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete user");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <SimpleDialog
      open
      onClose={onClose}
      title="Delete User"
      icon={<TrashBinMinimalistic size={16} />}
      width={380}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={handleDelete} loading={deleting}>
            Delete
          </Button>
        </div>
      }
    >
      <p className="text-sm text-soft leading-relaxed">
        Are you sure you want to delete user <strong className="text-main">{user.username}</strong>? This action cannot be undone.
      </p>
    </SimpleDialog>
  );
}

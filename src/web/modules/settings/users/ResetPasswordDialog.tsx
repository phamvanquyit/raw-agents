import { Restart } from "@solar-icons/react";
import { useState } from "react";
import { apiClient } from "src/common/api";
import type { User } from "src/common/types";
import RenderIf from "src/components/ui/RenderIf";
import { Button } from "src/components/ui/button";
import { SimpleDialog } from "src/components/ui/dialog";
import { Field } from "src/components/ui/form-field";
import { Input } from "src/components/ui/input";
import { toast } from "src/components/ui/toast";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ResetPasswordDialogProps {
  user: User;
  onClose: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ResetPasswordDialog({ user, onClose }: ResetPasswordDialogProps) {
  const [password, setPassword] = useState("");
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleReset = async () => {
    setError("");
    setSaving(true);
    try {
      const result = await apiClient.post<{ password: string }>(`/api/users/${user.id}/reset-password`, {
        password: password || undefined,
      });
      setGeneratedPassword(result.password);
      toast.success(`Password reset for ${user.username}`);
    } catch (err: any) {
      setError(err.message || "Failed to reset password");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SimpleDialog
      open
      onClose={onClose}
      title={`Reset Password — ${user.username}`}
      icon={<Restart size={16} />}
      width={400}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
          <RenderIf condition={!generatedPassword}>
            <Button variant="primary" size="sm" onClick={handleReset} loading={saving}>
              Reset Password
            </Button>
          </RenderIf>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <RenderIf condition={!generatedPassword}>
          <Field label="New Password" optional>
            <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Leave blank to auto-generate" />
          </Field>
        </RenderIf>

        <RenderIf condition={!!generatedPassword}>
          {() => (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                New password for <strong>{user.username}</strong>:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 rounded-lg bg-muted border border-border font-mono text-sm text-foreground select-all">
                  {generatedPassword}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(generatedPassword);
                    toast.success("Password copied to clipboard");
                  }}
                >
                  Copy
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Make sure to save this password. It won't be shown again.</p>
            </div>
          )}
        </RenderIf>

        <RenderIf condition={!!error}>
          <div className="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-xs text-destructive font-medium">{error}</p>
          </div>
        </RenderIf>
      </div>
    </SimpleDialog>
  );
}

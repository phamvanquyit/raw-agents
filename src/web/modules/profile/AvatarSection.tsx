import { Refresh } from "@solar-icons/react";
import { useState } from "react";
import { apiClient } from "src/common/api";
import { fetchCurrentUser } from "src/common/authSlice";
import { UserAvatar, genConfig } from "src/components/UserAvatar";
import { toast } from "src/components/ui/toast";
import { useAppDispatch } from "src/store/store";
import { SectionRow } from "./SectionRow";

interface AvatarSectionProps {
  avatar: string;
  name: string;
  onAvatarChange: (avatar: string) => void;
}

export function AvatarSection({ avatar, name, onAvatarChange }: AvatarSectionProps) {
  const dispatch = useAppDispatch();
  const [saving, setSaving] = useState(false);

  const handleRandomize = async () => {
    const config = genConfig();
    const newAvatar = JSON.stringify(config);
    onAvatarChange(newAvatar);

    setSaving(true);
    try {
      await apiClient.patch("/api/auth/update-profile", { avatar: newAvatar });
      await dispatch(fetchCurrentUser()).unwrap();
      toast.success("Avatar updated");
    } catch (error: any) {
      toast.error(error.message || "Failed to update avatar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionRow title="Avatar" description="Update your profile avatar">
      <div className="flex items-center gap-5">
        <div className="relative group">
          <UserAvatar avatar={avatar} name={name} size={72} className="border-2 border-primary/20" />
          <button
            type="button"
            onClick={handleRandomize}
            disabled={saving}
            className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-110 transition-transform disabled:opacity-50 disabled:hover:scale-100"
            title="Randomize Avatar"
          >
            <Refresh size={14} className={saving ? "animate-spin" : ""} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">Click the button to randomize your avatar.</p>
      </div>
    </SectionRow>
  );
}

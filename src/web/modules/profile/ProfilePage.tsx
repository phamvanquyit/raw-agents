import { useState } from "react";
import { PageShell } from "src/components/PageShell";
import { Field } from "src/components/ui/form-field";
import { Input } from "src/components/ui/input";
import { useAppSelector } from "src/store/store";
import { AvatarSection } from "./AvatarSection";
import { BasicInfoSection } from "./BasicInfoSection";
import { SectionRow } from "./SectionRow";
import { SecuritySection } from "./SecuritySection";

export default function ProfilePage() {
  const user = useAppSelector((s) => s.auth.user);
  const [avatar, setAvatar] = useState(user?.avatar || "");

  if (!user) return null;

  return (
    <PageShell>
      <div className="mb-2">
        <h1 className="text-xl font-display font-semibold text-foreground">Profile Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your personal information and security settings.</p>
      </div>

      <AvatarSection avatar={avatar} name={user.name || user.username} onAvatarChange={setAvatar} />

      <div className="border-t border-border/40" />

      <SectionRow title="Account" description="Your account credentials">
        <div className="max-w-sm space-y-1.5">
          <Field label="Username">
            <Input value={user.username} disabled className="bg-card/50 opacity-60" />
          </Field>
          <p className="text-[10px] text-muted-foreground italic">Username cannot be changed.</p>
        </div>
      </SectionRow>

      <div className="border-t border-border/40" />

      <BasicInfoSection user={user} avatar={avatar} />

      <div className="border-t border-border/40" />

      <SecuritySection />
    </PageShell>
  );
}

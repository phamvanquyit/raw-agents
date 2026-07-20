import { CheckCircle } from "@solar-icons/react";
import { useForm } from "@tanstack/react-form";
import { apiClient } from "src/common/api";
import { fetchCurrentUser } from "src/common/authSlice";
import type { User } from "src/common/types";
import { Button } from "src/components/ui/button";
import { Field } from "src/components/ui/form-field";
import { Input } from "src/components/ui/input";
import { toast } from "src/components/ui/toast";
import { useAppDispatch } from "src/store/store";
import { SectionRow } from "./SectionRow";

interface BasicInfoSectionProps {
  user: User;
  avatar: string;
}

export function BasicInfoSection({ user, avatar }: BasicInfoSectionProps) {
  const dispatch = useAppDispatch();

  const form = useForm({
    defaultValues: {
      name: user.name || "",
    },
    onSubmit: async ({ value }) => {
      try {
        await apiClient.patch("/api/auth/update-profile", { name: value.name, avatar });
        await dispatch(fetchCurrentUser()).unwrap();
        toast.success("Profile updated successfully");
      } catch (error: any) {
        toast.error(error.message || "Failed to update profile");
      }
    },
  });

  return (
    <SectionRow title="Basic Information" description="Your display name">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
        <div className="max-w-sm">
          <form.Field name="name">
            {(field) => (
              <Field label="Display Name" required>
                <Input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} placeholder="Your full name" />
              </Field>
            )}
          </form.Field>
        </div>
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" variant="primary" size="sm" loading={isSubmitting} icon={<CheckCircle size={16} />}>
              Save Changes
            </Button>
          )}
        </form.Subscribe>
      </form>
    </SectionRow>
  );
}

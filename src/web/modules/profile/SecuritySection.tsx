import { Key } from "@solar-icons/react";
import { useForm } from "@tanstack/react-form";
import { apiClient } from "src/common/api";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Field } from "src/components/ui/label";
import { toast } from "src/components/ui/toast";
import { SectionRow } from "./SectionRow";

export function SecuritySection() {
  const form = useForm({
    defaultValues: {
      oldPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
    onSubmit: async ({ value }) => {
      try {
        await apiClient.post("/api/auth/change-password", {
          oldPassword: value.oldPassword,
          newPassword: value.newPassword,
        });
        toast.success("Password changed successfully");
        form.reset();
      } catch (error: any) {
        toast.error(error.message || "Failed to change password");
      }
    },
  });

  return (
    <SectionRow title="Security" description="Update your password to keep your account secure">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
        className="space-y-4 max-w-sm"
      >
        <form.Field
          name="oldPassword"
          validators={{
            onSubmit: ({ value }) => (!value ? "Current password is required" : undefined),
          }}
        >
          {(field) => (
            <Field label="Current Password" required error={field.state.meta.errors[0]?.toString()}>
              <Input type="password" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />
            </Field>
          )}
        </form.Field>
        <form.Field
          name="newPassword"
          validators={{
            onSubmit: ({ value }) => {
              if (!value) return "New password is required";
              if (value.length < 6) return "Password must be at least 6 characters";
              return undefined;
            },
          }}
        >
          {(field) => (
            <Field label="New Password" required error={field.state.meta.errors[0]?.toString()}>
              <Input type="password" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />
            </Field>
          )}
        </form.Field>
        <form.Field
          name="confirmPassword"
          validators={{
            onSubmit: ({ value, fieldApi }) => {
              if (!value) return "Please confirm your password";
              if (value !== fieldApi.form.getFieldValue("newPassword")) return "Passwords do not match";
              return undefined;
            },
          }}
        >
          {(field) => (
            <Field label="Confirm New Password" required error={field.state.meta.errors[0]?.toString()}>
              <Input type="password" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />
            </Field>
          )}
        </form.Field>
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" variant="secondary" size="sm" loading={isSubmitting} icon={<Key size={16} />}>
              Update Password
            </Button>
          )}
        </form.Subscribe>
      </form>
    </SectionRow>
  );
}

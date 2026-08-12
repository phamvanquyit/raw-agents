import Key from "@solar-icons/react/security/Key";
import { useForm } from "@tanstack/react-form";
import { Button, Form, Input, message } from "antd";
import { apiClient } from "src/common/api";
import { SectionRow } from "src/components/SectionRow";

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
        message.success("Password changed successfully");
        form.reset();
      } catch (error: any) {
        message.error(error.message || "Failed to change password");
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
          {(field) => {
            const error = field.state.meta.errors[0]?.toString();
            return (
              <Form.Item
                label={
                  <span className="text-muted-foreground">
                    Current Password
                    <span className="text-destructive"> *</span>
                  </span>
                }
                layout="vertical"
                required
                validateStatus={error ? "error" : undefined}
                help={error}
                className="!mb-0"
              >
                <Input type="password" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />
              </Form.Item>
            );
          }}
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
          {(field) => {
            const error = field.state.meta.errors[0]?.toString();
            return (
              <Form.Item
                label={
                  <span className="text-muted-foreground">
                    New Password
                    <span className="text-destructive"> *</span>
                  </span>
                }
                layout="vertical"
                required
                validateStatus={error ? "error" : undefined}
                help={error}
                className="!mb-0"
              >
                <Input type="password" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />
              </Form.Item>
            );
          }}
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
          {(field) => {
            const error = field.state.meta.errors[0]?.toString();
            return (
              <Form.Item
                label={
                  <span className="text-muted-foreground">
                    Confirm New Password
                    <span className="text-destructive"> *</span>
                  </span>
                }
                layout="vertical"
                required
                validateStatus={error ? "error" : undefined}
                help={error}
                className="!mb-0"
              >
                <Input type="password" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />
              </Form.Item>
            );
          }}
        </form.Field>
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(isSubmitting) => (
            <Button htmlType="submit" type="default" size="small" loading={isSubmitting} icon={<Key size={16} />}>
              Update Password
            </Button>
          )}
        </form.Subscribe>
      </form>
    </SectionRow>
  );
}

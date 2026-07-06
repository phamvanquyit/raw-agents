import { PenNewSquare, UserPlus } from "@solar-icons/react";
import { useForm } from "@tanstack/react-form";
import { apiClient } from "src/common/api";
import type { User } from "src/common/types";
import RenderIf from "src/components/ui/RenderIf";
import { Button } from "src/components/ui/button";
import { SimpleDialog } from "src/components/ui/dialog";
import { Input } from "src/components/ui/input";
import { Field } from "src/components/ui/label";
import { Select } from "src/components/ui/select";
import { toast } from "src/components/ui/toast";

// ─── Types ───────────────────────────────────────────────────────────────────

interface UserFormProps {
  user?: User | null;
  onClose: () => void;
  onSaved: () => void;
}

const ROLE_OPTIONS = [
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
] as const;

// ─── Component ───────────────────────────────────────────────────────────────

export function UserFormDialog({ user, onClose, onSaved }: UserFormProps) {
  const isEdit = !!user;

  const form = useForm({
    defaultValues: {
      username: user?.username ?? "",
      name: user?.name ?? "",
      password: "",
      role: user?.role ?? "member",
    },
    onSubmit: async ({ value }) => {
      try {
        if (isEdit) {
          await apiClient.put(`/api/users/${user.id}`, {
            username: value.username,
            name: value.name,
            role: value.role,
          });
          toast.success(`User ${value.username} updated`);
        } else {
          await apiClient.post("/api/users", {
            username: value.username,
            name: value.name,
            password: value.password,
            role: value.role,
          });
          toast.success(`User ${value.username} created`);
        }
        onSaved();
        onClose();
      } catch (err: any) {
        toast.error(err.message || "Failed to save user");
      }
    },
  });

  return (
    <SimpleDialog
      open
      onClose={onClose}
      title={isEdit ? "Edit User" : "Add User"}
      icon={isEdit ? <PenNewSquare size={16} /> : <UserPlus size={16} />}
      width={440}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(isSubmitting) => (
              <Button variant="primary" size="sm" onClick={() => form.handleSubmit()} loading={isSubmitting}>
                {isEdit ? "Save" : "Create"}
              </Button>
            )}
          </form.Subscribe>
        </div>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
        className="flex flex-col gap-3.5"
      >
        <form.Field
          name="username"
          validators={{
            onSubmit: ({ value }) => (!value.trim() ? "Username is required" : undefined),
          }}
        >
          {(field) => (
            <Field label="Username" required error={field.state.meta.errors[0]?.toString()}>
              <Input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} placeholder="john_doe" />
            </Field>
          )}
        </form.Field>

        <form.Field
          name="name"
          validators={{
            onSubmit: ({ value }) => (!value.trim() ? "Name is required" : undefined),
          }}
        >
          {(field) => (
            <Field label="Name" required error={field.state.meta.errors[0]?.toString()}>
              <Input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} placeholder="John Doe" />
            </Field>
          )}
        </form.Field>

        <RenderIf condition={!isEdit}>
          <form.Field
            name="password"
            validators={{
              onSubmit: ({ value }) => {
                if (!value) return "Password is required";
                if (value.length < 8) return "Password must be at least 8 characters";
                return undefined;
              },
            }}
          >
            {(field) => (
              <Field label="Password" required error={field.state.meta.errors[0]?.toString()}>
                <Input
                  type="password"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="Min 8 characters"
                />
              </Field>
            )}
          </form.Field>
        </RenderIf>

        <form.Field name="role">
          {(field) => (
            <Field label="Role" required>
              <Select value={field.state.value} onChange={(val) => field.handleChange(val as "admin" | "member")} options={[...ROLE_OPTIONS]} />
            </Field>
          )}
        </form.Field>
      </form>
    </SimpleDialog>
  );
}

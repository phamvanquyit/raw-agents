import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { TrashBinTrash } from "@solar-icons/react";
import { forwardRef, useState } from "react";
import { Button } from "src/components/ui/button";
import { cn } from "src/lib/utils";

// ─── AlertDialog ──────────────────────────────────────────────────────────────
// AlertDialog — Radix AlertDialog primitives.

const AlertDialog = AlertDialogPrimitive.Root;
const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

const AlertDialogContent = forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>
>(function AlertDialogContent({ className, ...props }, ref) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
      <AlertDialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%]",
          "w-full max-w-[280px] rounded-md border border-border bg-card p-4 shadow-panel",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          className,
        )}
        {...props}
      />
    </AlertDialogPrimitive.Portal>
  );
});

const AlertDialogTitle = forwardRef<React.ComponentRef<typeof AlertDialogPrimitive.Title>, React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>>(
  function AlertDialogTitle({ className, ...props }, ref) {
    return <AlertDialogPrimitive.Title ref={ref} className={cn("text-xs font-semibold text-foreground", className)} {...props} />;
  },
);

const AlertDialogDescription = forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(function AlertDialogDescription({ className, ...props }, ref) {
  return <AlertDialogPrimitive.Description ref={ref} className={cn("text-2xs text-muted-foreground leading-snug", className)} {...props} />;
});

const AlertDialogAction = AlertDialogPrimitive.Action;
const AlertDialogCancel = AlertDialogPrimitive.Cancel;

/* ── DeleteConfirmButton — convenience wrapper ─────────────────────────────── */

interface DeleteConfirmButtonProps {
  label?: string;
  description?: string;
  onConfirm: () => void;
  size?: "sm" | "md";
  children?: React.ReactNode;
  disabled?: boolean;
}

function DeleteConfirmButton({ label = "Delete this item?", description, onConfirm, size = "sm", children, disabled = false }: DeleteConfirmButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {children ? (
          <button type="button" disabled={disabled} className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-50">
            {children}
          </button>
        ) : (
          <Button size={size} variant="danger" disabled={disabled} icon={<TrashBinTrash size={12} />} />
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <div className="flex flex-col gap-2.5">
          <AlertDialogTitle>{label}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
          <div className="flex flex-row justify-end gap-2">
            <AlertDialogCancel asChild>
              <Button size="sm" variant="secondary">
                Cancel
              </Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  setOpen(false);
                  onConfirm();
                }}
              >
                Delete
              </Button>
            </AlertDialogAction>
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
  DeleteConfirmButton,
};
export type { DeleteConfirmButtonProps };

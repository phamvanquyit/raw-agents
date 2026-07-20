import * as DialogPrimitive from "@radix-ui/react-dialog";
import { type ReactNode, forwardRef } from "react";
import { cn } from "src/lib/utils";

// ─── Dialog ───────────────────────────────────────────────────────────────────
// Dialog — Radix Dialog primitives with card surfaces.

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = forwardRef<React.ComponentRef<typeof DialogPrimitive.Overlay>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>>(
  function DialogOverlay({ className, ...props }, ref) {
    return (
      <DialogPrimitive.Overlay
        ref={ref}
        className={cn(
          "fixed inset-0 z-50 bg-black/80 backdrop-blur-sm",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          className,
        )}
        {...props}
      />
    );
  },
);

const DialogContent = forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { width?: number | string }
>(function DialogContent({ className, children, width = 420, ...props }, ref) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%]",
          "flex flex-col outline-none",
          "rounded-md border border-border bg-background shadow-panel",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]",
          className,
        )}
        style={{ width, maxWidth: "calc(100vw - 32px)", maxHeight: "calc(100vh - 32px)" }}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("px-3 py-2.5 border-b border-border bg-muted shrink-0 flex items-center gap-2.5 min-w-0 rounded-t-md", className)} {...props} />
);

const DialogBody = ({ className, noPadding, ...props }: React.HTMLAttributes<HTMLDivElement> & { noPadding?: boolean }) =>
  noPadding ? (
    <div className={cn("relative flex-1 min-h-0 overflow-hidden", className)} {...props} />
  ) : (
    <div className={cn("relative px-3 py-3 overflow-y-auto min-h-0", className)}>
      <div className="rounded-md border border-border bg-card p-3 shadow-card" {...props} />
    </div>
  );

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("px-3 py-2.5 border-t border-border bg-muted shrink-0 gap-3 rounded-b-md", className)} {...props} />
);

const DialogTitle = forwardRef<React.ComponentRef<typeof DialogPrimitive.Title>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>>(
  function DialogTitle({ className, ...props }, ref) {
    return <DialogPrimitive.Title ref={ref} className={cn("font-display font-semibold text-md text-foreground truncate", className)} {...props} />;
  },
);

const DialogDescription = forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...props }, ref) {
  return <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />;
});

/* ── SimpleDialog — convenience wrapper ────────────────────────────────────── */
// Use when you just want open/onClose/title/children/footer without composition.

interface SimpleDialogProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number | string;
  top?: number;
  maskClosable?: boolean;
  noPadding?: boolean;
  fullHeight?: boolean;
  height?: number | string;
}

function SimpleDialog({
  open,
  onClose,
  title,
  icon,
  children,
  footer,
  width = 420,
  top,
  maskClosable = true,
  noPadding = false,
  fullHeight = false,
  height,
}: SimpleDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogPortal>
        <DialogOverlay onClick={maskClosable ? onClose : undefined} />
        <DialogPrimitive.Content
          className={cn(
            "fixed z-50 flex flex-col outline-none",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.96]",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.97]",
            top != null ? "left-[50%] translate-x-[-50%]" : "left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]",
            fullHeight && "h-full",
          )}
          style={{
            width,
            maxWidth: "calc(100vw - 32px)",
            ...(height ? { height } : {}),
            maxHeight: `calc(100vh - ${(top ?? 16) + 16}px)`,
            ...(top != null ? { top } : {}),
          }}
          onPointerDownOutside={maskClosable ? undefined : (e) => e.preventDefault()}
          onInteractOutside={maskClosable ? undefined : (e) => e.preventDefault()}
        >
          <div className="flex-1 rounded-md border border-border/60 bg-background shadow-panel overflow-hidden flex flex-col max-h-[inherit]">
            <div className="px-4 py-3 border-b border-border/40 shrink-0 flex items-center gap-2.5 min-w-0 rounded-t-md">
              {icon && (
                <div className="flex items-center justify-center w-field-sm h-field-sm rounded-lg shrink-0 bg-muted/60">
                  <div className="text-muted-foreground text-[14px] leading-none">{icon}</div>
                </div>
              )}
              <div className="min-w-0 flex-1">
                {title && <DialogPrimitive.Title className="font-display font-semibold text-md text-foreground truncate">{title}</DialogPrimitive.Title>}
              </div>
              <DialogClose asChild>
                <button
                  type="button"
                  onClick={onClose}
                  className="shrink-0 w-field-sm h-field-sm flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-150 cursor-pointer"
                  aria-label="Close"
                >
                  <svg aria-hidden="true" width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="2" y1="2" x2="10" y2="10" />
                    <line x1="10" y1="2" x2="2" y2="10" />
                  </svg>
                </button>
              </DialogClose>
            </div>
            {noPadding ? (
              <div className="relative flex-1 min-h-0 overflow-hidden">{children}</div>
            ) : (
              <div className="relative px-5 pb-5 overflow-y-auto min-h-0">{children}</div>
            )}
            {footer && <div className="px-5 py-3 border-t border-border/40 shrink-0 gap-3 rounded-b-md">{footer}</div>}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  SimpleDialog,
};
export type { SimpleDialogProps };

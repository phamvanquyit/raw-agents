import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CloseCircle } from "@solar-icons/react";
import { type ReactNode, forwardRef } from "react";
import { cn } from "src/lib/utils";

// ─── Sheet (Drawer) ──────────────────────────────────────────────────────────
// Sheet (Drawer) — slide-in panel using Radix Dialog.

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = forwardRef<React.ComponentRef<typeof DialogPrimitive.Overlay>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>>(
  function SheetOverlay({ className, ...props }, ref) {
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

const SheetContent = forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    side?: "right" | "left";
    width?: number | string;
  }
>(function SheetContent({ className, children, side = "right", width = 420, ...props }, ref) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed z-50 flex flex-col h-full outline-none",
          "border-l border-border bg-background shadow-panel",
          side === "right" ? "inset-y-0 right-0" : "inset-y-0 left-0 border-l-0 border-r",
          "data-[state=open]:animate-in data-[state=open]:slide-in-from-right-full",
          "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right-full",
          className,
        )}
        style={{ width, maxWidth: "calc(100vw - 48px)" }}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </SheetPortal>
  );
});

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("px-4 py-2.5 border-b border-border bg-card shrink-0 flex items-center gap-2.5 min-w-0", className)} {...props} />
);

const SheetTitle = forwardRef<React.ComponentRef<typeof DialogPrimitive.Title>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>>(
  function SheetTitle({ className, ...props }, ref) {
    return <DialogPrimitive.Title ref={ref} className={cn("font-display text-md text-foreground truncate", className)} {...props} />;
  },
);

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("px-4 py-2.5 border-t border-border bg-card shrink-0 flex items-center justify-end gap-2", className)} {...props} />
);

/* ── SimpleSheet — convenience wrapper ─────────────────────────────────────── */

interface SimpleSheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number | string;
  maskClosable?: boolean;
}

function SimpleSheet({ open, onClose, title, icon, children, footer, width = 420, maskClosable = true }: SimpleSheetProps) {
  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <SheetPortal>
        <SheetOverlay onClick={maskClosable ? onClose : undefined} />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex flex-col h-full outline-none",
            "border-l border-border bg-background shadow-panel",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-right-full",
            "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right-full",
          )}
          style={{ width, maxWidth: "calc(100vw - 48px)" }}
          onPointerDownOutside={maskClosable ? undefined : (e) => e.preventDefault()}
          onInteractOutside={maskClosable ? undefined : (e) => e.preventDefault()}
        >
          <div className="flex-1 bg-background overflow-hidden flex flex-col h-full">
            {(title || icon) && (
              <div className="px-4 py-2.5 border-b border-border bg-card shrink-0 flex items-center gap-2.5 min-w-0">
                {icon && (
                  <div className="flex items-center justify-center w-field-sm h-field-sm rounded-lg shrink-0 bg-muted border border-border">
                    <div className="text-muted-foreground">{icon}</div>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  {title && <DialogPrimitive.Title className="font-display text-md text-foreground truncate">{title}</DialogPrimitive.Title>}
                </div>
                <DialogPrimitive.Close asChild>
                  <button
                    type="button"
                    onClick={onClose}
                    className="shrink-0 w-field-sm h-field-sm rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all cursor-pointer"
                    aria-label="Close"
                  >
                    <CloseCircle width={16} height={16} />
                  </button>
                </DialogPrimitive.Close>
              </div>
            )}
            <div className="relative flex-1 min-h-0 overflow-y-auto px-4 py-4">{children}</div>
            {footer && (
              <div className="px-4 py-2.5 border-t border-border bg-card shrink-0">
                <div className="flex items-center justify-end gap-2">{footer}</div>
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </SheetPortal>
    </Sheet>
  );
}

export { Sheet, SheetTrigger, SheetClose, SheetPortal, SheetOverlay, SheetContent, SheetHeader, SheetTitle, SheetFooter, SimpleSheet };
export type { SimpleSheetProps };

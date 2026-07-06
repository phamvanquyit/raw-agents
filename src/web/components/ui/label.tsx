import * as LabelPrimitive from "@radix-ui/react-label";
import { type ReactElement, type ReactNode, cloneElement, forwardRef, isValidElement, useId } from "react";
import { cn } from "src/lib/utils";

// ─── Label ────────────────────────────────────────────────────────────────────

const Label = forwardRef<React.ComponentRef<typeof LabelPrimitive.Root>, React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>>(function Label(
  { className, ...props },
  ref,
) {
  return (
    <LabelPrimitive.Root
      ref={ref}
      className={cn("text-xs font-medium text-soft leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", className)}
      {...props}
    />
  );
});

// ─── Field ────────────────────────────────────────────────────────────────────
// Label + child input wrapper.

interface FieldProps {
  label: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  children: ReactNode;
}

function Field({ label, required, optional, error, children }: FieldProps) {
  const fieldId = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={fieldId}>
        {label}
        {required && <span className="text-primary ml-0.5">*</span>}
        {optional && <span className="text-muted ml-1 font-normal">(optional)</span>}
      </Label>
      {isValidElement(children) ? cloneElement(children as ReactElement<{ id?: string }>, { id: fieldId }) : children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

export { Label, Field };
export type { FieldProps };

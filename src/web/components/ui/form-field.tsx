import { type ReactElement, type ReactNode, cloneElement, isValidElement, useId } from "react";
import { FieldError, FieldLabel, Field as ShadcnField } from "src/components/ui/field";

interface FieldProps {
  label: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  children: ReactNode;
}

/** App convenience wrapper around shadcn Field composition. */
function Field({ label, required, optional, error, children }: FieldProps) {
  const fieldId = useId();

  return (
    <ShadcnField data-invalid={error ? true : undefined} className="gap-1.5">
      <FieldLabel htmlFor={fieldId} className="text-muted-foreground">
        {label}
        {required ? <span className="text-destructive">*</span> : null}
        {optional ? <span className="font-normal text-muted-foreground">(optional)</span> : null}
      </FieldLabel>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<{ id?: string; "aria-invalid"?: boolean }>, {
            id: fieldId,
            "aria-invalid": !!error || undefined,
          })
        : children}
      {error ? <FieldError>{error}</FieldError> : null}
    </ShadcnField>
  );
}

export { Field };
export type { FieldProps };

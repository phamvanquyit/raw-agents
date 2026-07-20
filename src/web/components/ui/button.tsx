import { type VariantProps, cva } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";
import { Spinner } from "src/components/ui/spinner";
import { cn } from "src/lib/utils";

const buttonVariants = cva(
  "box-border relative inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-base font-medium transition-colors duration-150 outline-none focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default: "border border-transparent bg-primary text-primary-foreground hover:bg-primary/90",
        primary: "border border-transparent bg-primary text-primary-foreground hover:bg-primary/90",
        brand: "border border-transparent bg-brand text-white hover:bg-brand-soft",
        destructive: "border border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90",
        danger: "border border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "bg-transparent text-foreground shadow-button-outline hover:bg-muted",
        secondary: "bg-secondary text-secondary-foreground border border-border hover:bg-muted",
        ghost: "border border-transparent bg-transparent text-foreground hover:bg-muted",
        link: "text-link underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-3",
        md: "h-8 px-3",
        xs: "h-6 gap-1 px-1.5 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 px-2 text-sm",
        lg: "h-9 px-4",
        icon: "size-8",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /** @deprecated Prefer composing children with the icon element. */
    icon?: React.ReactNode;
    /** @deprecated Prefer composing `<Spinner />` as a child. */
    loading?: boolean;
    block?: boolean;
  };

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  icon,
  loading = false,
  block = false,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size }), block && "w-full", className)}
      {...props}
    >
      {loading ? <Spinner data-icon="inline-start" /> : icon}
      {children}
    </Comp>
  );
}

export { Button, buttonVariants };
export type { ButtonProps };

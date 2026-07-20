import { toast as sonnerToast } from "sonner";
import { Toaster } from "src/components/ui/sonner";

/**
 * Imperative toast API — backed by sonner.
 *
 * ```ts
 * toast.success("Saved!");
 * toast.error("Something went wrong");
 * toast.info("Heads up");
 * ```
 */
export const toast = {
  success: (msg: string) => sonnerToast.success(msg),
  error: (msg: string) => sonnerToast.error(msg),
  info: (msg: string) => sonnerToast.info(msg),
};

export const gameToast = toast;

/** @deprecated Use `<Toaster />` from `src/components/ui/sonner`. */
export function ToastProvider() {
  return <Toaster />;
}

export { Toaster };

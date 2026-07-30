/**
 * Legacy Remix SSR runtime — replaced by sites-bundle.ts + sites-data-runtime.ts.
 * Kept as a thin re-export so old imports (if any) do not break the build.
 */
export { invalidateSiteCaches } from "./sites-bundle.js";

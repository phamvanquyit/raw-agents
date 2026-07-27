import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { previewSite } from "../../sites.service.js";

const TOOL_TIMEOUT_MS = 15_000;

function summarizeLoaderData(data: unknown): unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      out[key] = {
        count: value.length,
        sample: value.slice(0, 1),
      };
    } else if (typeof value === "string" && value.length > 200) {
      out[key] = `${value.slice(0, 200)}…`;
    } else {
      out[key] = value;
    }
  }
  return out;
}

async function withToolTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`preview_site timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function makePreviewSiteTool(siteId: string) {
  return tool(
    async () => {
      try {
        const result = await withToolTimeout(previewSite(siteId), TOOL_TIMEOUT_MS);
        const htmlPreview = result.html.length > 2000 ? `${result.html.slice(0, 2000)}\n…[truncated]` : result.html;
        // Keep payload small for the model/SSE — editor refreshes iframe via /preview API
        return JSON.stringify({
          ok: true,
          htmlChars: result.html.length,
          htmlPreview,
          dataSummary: summarizeLoaderData(result.data),
        });
      } catch (err) {
        return JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    },
    {
      name: "preview_site",
      description: "SSR-render the draft site and return a short HTML preview + data summary (or error). Use once after related edits.",
      schema: z.object({}),
    },
  );
}

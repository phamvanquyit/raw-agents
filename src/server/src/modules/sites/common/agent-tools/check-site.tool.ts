import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { previewSite, readDraftFile } from "../../sites.service.js";

const TOOL_TIMEOUT_MS = 15_000;

function summarizeLoaderData(data: unknown): unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      out[key] = { count: value.length };
    } else if (value && typeof value === "object") {
      out[key] = { type: "object", keys: Object.keys(value as object).slice(0, 20) };
    } else if (typeof value === "string" && value.length > 120) {
      out[key] = `${value.slice(0, 120)}…`;
    } else {
      out[key] = value;
    }
  }
  return out;
}

function barePostFormHint(routeSource: string): string | undefined {
  const hasBarePost = /<form\b[^>]*\bmethod\s*=\s*["']?post["']?/i.test(routeSource);
  const usesRaForm = /from\s+["']\.\/ra-ui\.jsx["']/.test(routeSource) && /\bRaForm\b/.test(routeSource);
  if (hasBarePost && !usesRaForm) {
    return 'Prefer platform RaForm: import { RaForm, RaSubmit } from "./ra-ui.jsx" instead of hand-written <form method="post">.';
  }
  return undefined;
}

function classifyError(message: string): { stage: string; hint: string } {
  const m = message.toLowerCase();
  if (m.includes("import ") || m.includes("cannot find module") || m.includes("resolve")) {
    return {
      stage: "import",
      hint: "Syntax/import error in draft files, or missing dependency — fix code or update package.json (deps install automatically on write).",
    };
  }
  if (m.includes("loader timed out") || m.includes("loader")) {
    return { stage: "loader", hint: "loader.js threw or timed out — check rawagents calls, await usage, and return shape." };
  }
  if (m.includes("render timed out") || m.includes("render") || m.includes("route.jsx") || m.includes("jsx") || m.includes("react")) {
    return { stage: "render", hint: "route.jsx failed while rendering — check loaderData fields vs JSX, invalid elements, or runtime throws." };
  }
  if (m.includes("timed out")) {
    return { stage: "timeout", hint: "SSR timed out — simplify loader work or fix an infinite loop." };
  }
  return { stage: "ssr", hint: "Fix the error in draft files, then call check_site again." };
}

async function withToolTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`check_site timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Validate draft SSR (import → loader → render). Used by the agent to detect/fix errors. */
export function makeCheckSiteTool(siteId: string) {
  return tool(
    async () => {
      try {
        const result = await withToolTimeout(previewSite(siteId), TOOL_TIMEOUT_MS);
        const route = readDraftFile(siteId, "route.jsx");
        const formHint = barePostFormHint(route);
        return JSON.stringify({
          ok: true,
          htmlChars: result.html.length,
          dataSummary: summarizeLoaderData(result.data),
          message: "Draft SSR succeeded.",
          ...(formHint ? { hint: formHint } : {}),
        });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        const { stage, hint } = classifyError(error);
        return JSON.stringify({ ok: false, stage, error, hint });
      }
    },
    {
      name: "check_site",
      description:
        "Validate the draft site by running SSR (import loader/route, run loader, render route). Returns ok or a structured error (stage/error/hint). Call after edits when you need to verify or debug failures. The live preview iframe refreshes automatically after writes — you do not need this just to refresh the UI.",
      schema: z.object({}),
    },
  );
}

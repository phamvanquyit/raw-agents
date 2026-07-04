/**
 * fetch-webpage.ts — Builtin tool: fetches a webpage via plain HTTP with
 * realistic browser headers (bot-bypass), retry, and output as raw HTML or
 * Markdown (Turndown).
 *
 * No headless browser — lightweight, works in Docker / any environment.
 */

import { tool } from "@langchain/core/tools";
import TurndownService from "turndown";
import { z } from "zod";

export const TOOL_DEF = {
  toolName: "fetch_webpage",
  toolLabel: "Fetch",
  description: "Fetches the full HTML content of a webpage by URL. Use this to read articles, documentation, or any public web page.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "The full URL of the webpage to fetch" },
      output: { type: "string", enum: ["html", "md"], description: 'Output format: "md" (default) or "html"' },
    },
    required: ["url"],
  },
};

/* ── constants ───────────────────────────────────────────────────────────────── */

/** Rotate through multiple realistic User-Agents to avoid fingerprinting. */
const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
];

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function buildHeaders(url: string): Record<string, string> {
  const origin = new URL(url).origin;
  return {
    "User-Agent": randomUA(),
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"macOS"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    Referer: origin,
    DNT: "1",
  };
}

/* ── helpers ─────────────────────────────────────────────────────────────────── */

/** Remove <script>, <style>, <noscript>, <svg>, <head> blocks from raw HTML. */
function stripNoisyTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "");
}

/** Convert cleaned HTML → Markdown via Turndown. */
function htmlToMarkdown(html: string): string {
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  });
  return td.turndown(html);
}

/** Simple retry wrapper — retries `fn` up to `retries` extra times on failure. */
async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        // exponential-ish back-off: 500ms, 1500ms
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

/* ── fetch via plain HTTP with bot-bypass headers ────────────────────────────── */

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: buildHeaders(url),
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.text();
}

/* ── tool definition ─────────────────────────────────────────────────────────── */

export const fetchWebpageTool = tool(
  async ({
    url,
    output = "md",
  }: {
    url: string;
    output?: "html" | "md";
  }) => {
    try {
      const rawHtml = await withRetry(() => fetchPage(url));

      const cleaned = stripNoisyTags(rawHtml);
      const content = output === "md" ? htmlToMarkdown(cleaned) : cleaned;

      return JSON.stringify({ url, output, content, length: content.length });
    } catch (err) {
      return JSON.stringify({ url, error: String(err), content: "" });
    }
  },
  {
    name: "fetch_webpage",
    description: `Fetches the content of a webpage by URL using HTTP with realistic browser headers.

Options:
- **output** (\`"html"\` | \`"md"\`): Return raw HTML (cleaned) or Markdown. Default: \`"md"\`.

The tool automatically retries up to 2 extra times on failure, rotates User-Agent headers to avoid bot detection, and strips noisy tags (script, style, noscript, svg, head).`,
    schema: z.object({
      url: z.string().url().describe("The full URL of the webpage to fetch"),
      output: z.enum(["html", "md"]).optional().default("md").describe('Output format: "md" (default) converts to Markdown, "html" returns cleaned HTML'),
    }),
  },
);

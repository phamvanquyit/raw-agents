import { describe, expect, test } from "bun:test";
import { buildSpaHtml, escapeHtml, requestOrigin } from "../common/spa-html.js";

const SHELL = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Raw Agents</title>
  <meta name="description" content="Old desc" />
  <meta property="og:image" content="/og-image.png" />
</head>
<body><div id="root"></div></body>
</html>`;

describe("spa-html OG injection", () => {
  test("escapeHtml escapes attribute-sensitive chars", () => {
    expect(escapeHtml(`A & B <C> "x"`)).toBe("A &amp; B &lt;C&gt; &quot;x&quot;");
  });

  test("requestOrigin prefers x-forwarded-* headers", () => {
    const req = new Request("http://internal:15888/chat/abc", {
      headers: {
        host: "internal:15888",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "agents.example.com",
      },
    });
    expect(requestOrigin(req)).toBe("https://agents.example.com");
  });

  test("resolvePublicBaseUrl prefers PUBLIC_BASE_URL then client then request", async () => {
    const { resolvePublicBaseUrl } = await import("../common/spa-html.js");
    const prev = process.env.PUBLIC_BASE_URL;
    try {
      process.env.PUBLIC_BASE_URL = "https://agents.example.com/";
      expect(resolvePublicBaseUrl({ clientOrigin: "http://localhost:5888" })).toBe("https://agents.example.com");

      delete process.env.PUBLIC_BASE_URL;
      expect(resolvePublicBaseUrl({ clientOrigin: "http://localhost:5888/" })).toBe("http://localhost:5888");

      const req = new Request("http://internal:15888/", {
        headers: { "x-forwarded-proto": "https", "x-forwarded-host": "proxy.example.com" },
      });
      expect(resolvePublicBaseUrl({ request: req })).toBe("https://proxy.example.com");
    } finally {
      if (prev === undefined) delete process.env.PUBLIC_BASE_URL;
      else process.env.PUBLIC_BASE_URL = prev;
    }
  });

  test("buildSpaHtml injects absolute og:image and page url", () => {
    const html = buildSpaHtml(SHELL, {
      origin: "https://agents.example.com",
      path: "/login",
    });
    expect(html).toContain('property="og:image" content="https://agents.example.com/og-image.png"');
    expect(html).toContain('property="og:url" content="https://agents.example.com/login"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toContain("<title>Raw Agents</title>");
    // no duplicate title
    expect(html.match(/<title>/g)?.length).toBe(1);
  });

  test("buildSpaHtml keeps title for unknown /chat agent", () => {
    const html = buildSpaHtml(SHELL, {
      origin: "https://agents.example.com",
      path: "/chat/does-not-exist",
    });
    expect(html).toContain("<title>Raw Agents</title>");
    expect(html).toContain('property="og:image" content="https://agents.example.com/og-image.png"');
  });
});

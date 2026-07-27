import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Hono } from "hono";
import { authRequest, createTestApp, setupAdmin } from "./test-helpers.js";

describe("Sites API", () => {
  let app: Hono;
  let cleanup: () => void;
  let token: string;
  let dataDir: string;
  let prevDataDir: string | undefined;

  beforeAll(async () => {
    prevDataDir = process.env.DATA_DIR;
    dataDir = mkdtempSync(join(tmpdir(), "raw-agents-sites-"));
    process.env.DATA_DIR = dataDir;

    const t = createTestApp();
    app = t.app;
    cleanup = t.cleanup;
    const admin = await setupAdmin(app);
    token = admin.token;
  });

  afterAll(() => {
    cleanup();
    if (prevDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = prevDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("CRUD + draft/approve + public render", async () => {
    const createRes = await authRequest(app, token, "POST", "/api/sites", {
      name: "News",
      slug: "news",
    });
    expect(createRes.status).toBe(201);
    const site = (await createRes.json()) as {
      id: string;
      slug: string;
      isPublished: boolean;
      draftDirty: boolean;
      depsStatus: string;
    };
    expect(site.slug).toBe("news");
    expect(site.isPublished).toBe(false);

    const filesRes = await authRequest(app, token, "GET", `/api/sites/${site.id}/files`);
    expect(filesRes.status).toBe(200);
    const files = (await filesRes.json()) as { files: Record<string, string>; draftDirty: boolean };
    expect(files.files["loader.js"]).toContain("export async function loader");
    expect(files.files["route.jsx"]).toContain("export default function Route");
    expect(files.files["styles.css"]).toContain(".page");
    expect(files.files["route.jsx"]).toContain('className="page"');

    const draftLoader = `export async function loader() { return { title: "Draft Title", message: "from draft" }; }
`;
    const putRes = await authRequest(app, token, "PUT", `/api/sites/${site.id}/files/loader.js`, {
      content: draftLoader,
      tree: "draft",
    });
    expect(putRes.status).toBe(200);
    const putBody = (await putRes.json()) as { draftDirty: boolean };
    expect(putBody.draftDirty).toBe(true);

    const draftRoute = `export default function Route({ loaderData }) {
  return (<div className="hero"><h1>{loaderData.title}</h1><p>{loaderData.message}</p></div>);
}
`;
    await authRequest(app, token, "PUT", `/api/sites/${site.id}/files/route.jsx`, {
      content: draftRoute,
      tree: "draft",
    });
    await authRequest(app, token, "PUT", `/api/sites/${site.id}/files/styles.css`, {
      content: ".hero { color: #b91c1c; }\n",
      tree: "draft",
    });

    const previewRes = await authRequest(app, token, "POST", `/api/sites/${site.id}/preview`, {});
    expect(previewRes.status).toBe(200);
    const preview = (await previewRes.json()) as { html: string };
    expect(preview.html).toContain("Draft Title");
    expect(preview.html).toContain("from draft");
    expect(preview.html).toContain("<style>");
    expect(preview.html).toContain(".hero { color: #b91c1c; }");
    expect(preview.html).toContain('class="hero"');

    // Public unpublished → 404
    const pub404 = await app.request("/api/public/sites/news");
    expect(pub404.status).toBe(404);

    await authRequest(app, token, "PUT", `/api/sites/${site.id}`, { isPublished: true });

    // Public still serves prod (scaffold), not draft
    const pubBefore = await app.request("/api/public/sites/news");
    expect(pubBefore.status).toBe(200);
    const pubBeforeBody = (await pubBefore.json()) as { html: string };
    expect(pubBeforeBody.html).not.toContain("Draft Title");
    expect(pubBeforeBody.html).toContain("Hello Site");

    const approveRes = await authRequest(app, token, "POST", `/api/sites/${site.id}/approve`, {});
    expect(approveRes.status).toBe(200);

    const prodFilesRes = await authRequest(app, token, "GET", `/api/sites/${site.id}/files?tree=prod`);
    const prodFiles = (await prodFilesRes.json()) as { files: Record<string, string> };
    expect(prodFiles.files["loader.js"]).toContain("Draft Title");

    const pubAfter = await app.request("/api/public/sites/news");
    expect(pubAfter.status).toBe(200);
    const pubAfterBody = (await pubAfter.json()) as { html: string; data: unknown };
    expect(pubAfterBody.html).toContain("Draft Title");
    expect(pubAfterBody.html).toContain("<style>");
    expect(pubAfterBody.html).toContain(".hero { color: #b91c1c; }");
    expect(pubAfterBody.data).toBeNull();

    // Discard after editing draft again
    await authRequest(app, token, "PUT", `/api/sites/${site.id}/files/loader.js`, {
      content: `export async function loader() { return { title: "Temp", message: "x" }; }\n`,
      tree: "draft",
    });
    const discardRes = await authRequest(app, token, "POST", `/api/sites/${site.id}/discard`, {});
    expect(discardRes.status).toBe(200);
    const filesAfterDiscard = await authRequest(app, token, "GET", `/api/sites/${site.id}/files`);
    const discarded = (await filesAfterDiscard.json()) as { files: Record<string, string>; draftDirty: boolean };
    expect(discarded.files["loader.js"]).toContain("Draft Title");
    expect(discarded.draftDirty).toBe(false);

    const delRes = await authRequest(app, token, "DELETE", `/api/sites/${site.id}`);
    expect(delRes.status).toBe(200);
  }, 180_000);

  test("public site password gate", async () => {
    const createRes = await authRequest(app, token, "POST", "/api/sites", {
      name: "Secret",
      slug: "secret-site",
    });
    expect(createRes.status).toBe(201);
    const site = (await createRes.json()) as { id: string };

    await authRequest(app, token, "PUT", `/api/sites/${site.id}`, {
      isPublished: true,
      publicPassword: "s3cret",
    });

    const lockedRes = await app.request("/api/public/sites/secret-site");
    expect(lockedRes.status).toBe(200);
    const locked = (await lockedRes.json()) as { locked?: boolean; requiresPassword?: boolean; html?: string };
    expect(locked.locked).toBe(true);
    expect(locked.requiresPassword).toBe(true);
    expect(locked.html).toBe("");

    const badVerify = await app.request("/api/public/sites/secret-site/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "wrong" }),
    });
    expect(badVerify.status).toBe(400);

    const okVerify = await app.request("/api/public/sites/secret-site/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "s3cret" }),
    });
    expect(okVerify.status).toBe(200);
    const verified = (await okVerify.json()) as { valid: boolean; token?: string };
    expect(verified.valid).toBe(true);
    expect(verified.token).toBeTruthy();

    const openRes = await app.request("/api/public/sites/secret-site", {
      headers: { "X-Site-Access-Token": verified.token! },
    });
    expect(openRes.status).toBe(200);
    const open = (await openRes.json()) as { locked?: boolean; html?: string };
    expect(open.locked).toBe(false);
    expect(open.html).toContain("Hello Site");

    const tokenCheck = await app.request("/api/public/sites/secret-site/verify-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: verified.token }),
    });
    expect(tokenCheck.status).toBe(200);
    expect(((await tokenCheck.json()) as { valid: boolean }).valid).toBe(true);

    await authRequest(app, token, "PUT", `/api/sites/${site.id}`, { publicPassword: null });
    const openNoPw = await app.request("/api/public/sites/secret-site");
    expect(openNoPw.status).toBe(200);
    expect(((await openNoPw.json()) as { locked?: boolean }).locked).toBe(false);

    await authRequest(app, token, "DELETE", `/api/sites/${site.id}`);
  }, 180_000);

  test("preview works when styles.css is missing (legacy sites)", async () => {
    const createRes = await authRequest(app, token, "POST", "/api/sites", {
      name: "Legacy CSS",
      slug: "legacy-css",
    });
    expect(createRes.status).toBe(201);
    const site = (await createRes.json()) as { id: string };

    unlinkSync(join(dataDir, "sites", site.id, "draft", "styles.css"));

    const previewRes = await authRequest(app, token, "POST", `/api/sites/${site.id}/preview`, {});
    expect(previewRes.status).toBe(200);
    const preview = (await previewRes.json()) as { html: string };
    expect(preview.html).toContain("Hello Site");
    expect(preview.html).toContain("data-ra-base");
    expect(preview.html).toContain("html,body{margin:0;padding:0}");
    expect(preview.html).not.toContain(".page {");

    await authRequest(app, token, "DELETE", `/api/sites/${site.id}`);
  }, 180_000);

  test("preview — loader via SSR worker + rawagents.datatable", async () => {
    const projectRes = await authRequest(app, token, "POST", "/api/datatables/projects", { name: "SiteNews" });
    expect(projectRes.status).toBe(201);
    const project = (await projectRes.json()) as { id: string; name: string };

    const tableRes = await authRequest(app, token, "POST", `/api/datatables/projects/${project.id}/tables`, { name: "Posts" });
    expect(tableRes.status).toBe(201);
    const table = (await tableRes.json()) as { id: string };

    await authRequest(app, token, "POST", `/api/datatables/tables/${table.id}/columns`, {
      name: "title",
      type: "text",
      required: true,
    });
    await authRequest(app, token, "POST", `/api/datatables/tables/${table.id}/rows`, {
      rows: [{ title: "Worker RPC Headline" }],
    });

    const createRes = await authRequest(app, token, "POST", "/api/sites", {
      name: "DT Site",
      slug: "dt-site",
    });
    expect(createRes.status).toBe(201);
    const site = (await createRes.json()) as { id: string };

    const loader = `export async function loader({ rawagents }) {
  const result = await rawagents.datatable.query({ project: "SiteNews", table: "Posts", limit: 10 });
  const rows = result.rows || result.items || [];
  return { title: rows[0]?.data?.title ?? rows[0]?.title ?? "missing", count: rows.length };
}
`;
    const route = `export default function Route({ loaderData }) {
  return (<div><h1>{loaderData.title}</h1><p>count:{loaderData.count}</p></div>);
}
`;
    await authRequest(app, token, "PUT", `/api/sites/${site.id}/files/loader.js`, { content: loader, tree: "draft" });
    await authRequest(app, token, "PUT", `/api/sites/${site.id}/files/route.jsx`, { content: route, tree: "draft" });

    const previewRes = await authRequest(app, token, "POST", `/api/sites/${site.id}/preview`, {});
    expect(previewRes.status).toBe(200);
    const preview = (await previewRes.json()) as { html: string };
    expect(preview.html).toContain("Worker RPC Headline");
    expect(preview.html).toContain("count:1");

    await authRequest(app, token, "DELETE", `/api/sites/${site.id}`);
  }, 180_000);

  test("member cannot access another user's site (IDOR)", async () => {
    const createRes = await authRequest(app, token, "POST", "/api/sites", {
      name: "Owner Site",
      slug: "owner-site",
    });
    expect(createRes.status).toBe(201);
    const site = (await createRes.json()) as { id: string };

    const memberRes = await authRequest(app, token, "POST", "/api/users", {
      username: "site_member",
      name: "Site Member",
      password: "password123",
      role: "member",
    });
    expect(memberRes.status).toBe(201);

    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "site_member", password: "password123" }),
    });
    expect(loginRes.status).toBe(200);
    const { token: memberToken } = (await loginRes.json()) as { token: string };

    expect((await authRequest(app, memberToken, "GET", `/api/sites/${site.id}`)).status).toBe(403);
    expect((await authRequest(app, memberToken, "PUT", `/api/sites/${site.id}`, { name: "Hacked" })).status).toBe(403);
    expect((await authRequest(app, memberToken, "DELETE", `/api/sites/${site.id}`)).status).toBe(403);
    expect((await authRequest(app, memberToken, "GET", `/api/sites/${site.id}/files`)).status).toBe(403);
    expect((await authRequest(app, memberToken, "POST", `/api/sites/${site.id}/preview`, {})).status).toBe(403);

    const listRes = await authRequest(app, memberToken, "GET", "/api/sites");
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as { items: { id: string }[] };
    expect(list.items.some((s) => s.id === site.id)).toBe(false);

    await authRequest(app, token, "DELETE", `/api/sites/${site.id}`);
  }, 180_000);

  test("PUT files with tree prod is rejected", async () => {
    const createRes = await authRequest(app, token, "POST", "/api/sites", {
      name: "Prod Write Block",
      slug: "prod-write-block",
    });
    expect(createRes.status).toBe(201);
    const site = (await createRes.json()) as { id: string };

    const putRes = await authRequest(app, token, "PUT", `/api/sites/${site.id}/files/loader.js`, {
      content: `export async function loader() { return { title: "x" }; }\n`,
      tree: "prod",
    });
    expect(putRes.status).toBe(400);

    await authRequest(app, token, "DELETE", `/api/sites/${site.id}`);
  }, 180_000);

  test("public password is hashed and not returned in API", async () => {
    const createRes = await authRequest(app, token, "POST", "/api/sites", {
      name: "Hash PW",
      slug: "hash-pw-site",
    });
    expect(createRes.status).toBe(201);
    const site = (await createRes.json()) as { id: string; hasPublicPassword?: boolean; publicPassword?: string };
    expect(site.hasPublicPassword).toBe(false);
    expect(site).not.toHaveProperty("publicPassword");

    const upd = await authRequest(app, token, "PUT", `/api/sites/${site.id}`, {
      isPublished: true,
      publicPassword: "s3cret-hash",
    });
    expect(upd.status).toBe(200);
    const updated = (await upd.json()) as { hasPublicPassword?: boolean; publicPassword?: unknown };
    expect(updated.hasPublicPassword).toBe(true);
    expect(updated).not.toHaveProperty("publicPassword");

    const okVerify = await app.request("/api/public/sites/hash-pw-site/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "s3cret-hash" }),
    });
    expect(okVerify.status).toBe(200);

    await authRequest(app, token, "DELETE", `/api/sites/${site.id}`);
  }, 180_000);
});

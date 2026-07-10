import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Hono } from "hono";
import { authHeaders, authRequest, createTestApp } from "./test-helpers.js";

describe("Auth API", () => {
  let app: Hono;
  let cleanup: () => void;

  beforeAll(() => {
    const t = createTestApp();
    app = t.app;
    cleanup = t.cleanup;
  });

  afterAll(() => cleanup());

  // ── Setup Status ──────────────────────────────────────────────────────

  test("GET /api/auth/setup-status — needsSetup=true when no users", async () => {
    const res = await app.request("/api/auth/setup-status");
    expect(res.status).toBe(200);

    const data = (await res.json()) as { needsSetup: boolean };
    expect(data.needsSetup).toBe(true);
  });

  // ── Initial Setup ─────────────────────────────────────────────────────

  let adminToken = "";

  test("POST /api/auth/setup — create first admin", async () => {
    const res = await app.request("/api/auth/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "admin",
        name: "Admin User",
        password: "password123",
        timezone: "Asia/Ho_Chi_Minh",
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { token: string; user: Record<string, unknown> };
    expect(data.token).toBeTruthy();
    expect(data.user.username).toBe("admin");
    expect(data.user.name).toBe("Admin User");
    expect(data.user.role).toBe("admin");
    // Password hash should NOT be in response
    expect(data.user).not.toHaveProperty("passwordHash");

    adminToken = data.token;
  });

  test("GET /api/auth/setup-status — needsSetup=false after setup", async () => {
    const res = await app.request("/api/auth/setup-status");
    const data = (await res.json()) as { needsSetup: boolean };
    expect(data.needsSetup).toBe(false);
  });

  test("POST /api/auth/setup — reject when already setup", async () => {
    const res = await app.request("/api/auth/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "admin2",
        name: "Admin 2",
        password: "password123",
        timezone: "UTC",
      }),
    });

    expect(res.status).toBe(400);
  });

  // ── Login ─────────────────────────────────────────────────────────────

  test("POST /api/auth/login — successful login", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "password123" }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { token: string; user: Record<string, unknown> };
    expect(data.token).toBeTruthy();
    expect(data.user.username).toBe("admin");
  });

  test("POST /api/auth/login — wrong password", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "wrongpassword" }),
    });

    expect(res.status).toBe(400);
  });

  test("POST /api/auth/login — non-existent user", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "nonexistent", password: "password123" }),
    });

    expect(res.status).toBe(400);
  });

  // ── Me ────────────────────────────────────────────────────────────────

  test("GET /api/auth/me — returns user with valid token", async () => {
    const res = await app.request("/api/auth/me", {
      headers: authHeaders(adminToken),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.username).toBe("admin");
    expect(data).not.toHaveProperty("passwordHash");
  });

  test("GET /api/auth/me — 401 without token", async () => {
    const res = await app.request("/api/auth/me");
    expect(res.status).toBe(401);
  });

  // ── Change Password ───────────────────────────────────────────────────

  test("POST /api/auth/change-password — success", async () => {
    const res = await authRequest(app, adminToken, "POST", "/api/auth/change-password", {
      oldPassword: "password123",
      newPassword: "newpassword456",
    });

    expect(res.status).toBe(200);

    // Verify new password works
    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "newpassword456" }),
    });
    expect(loginRes.status).toBe(200);

    // Change back for remaining tests
    await authRequest(app, adminToken, "POST", "/api/auth/change-password", {
      oldPassword: "newpassword456",
      newPassword: "password123",
    });
  });

  test("POST /api/auth/change-password — wrong old password", async () => {
    const res = await authRequest(app, adminToken, "POST", "/api/auth/change-password", {
      oldPassword: "totallyWrong",
      newPassword: "newpassword456",
    });

    expect(res.status).toBe(400);
  });

  test("POST /api/auth/change-password — new password too short", async () => {
    const res = await authRequest(app, adminToken, "POST", "/api/auth/change-password", {
      oldPassword: "password123",
      newPassword: "short",
    });

    expect(res.status).toBe(400);
  });

  // ── Update Profile ────────────────────────────────────────────────────

  test("PATCH /api/auth/update-profile — update name", async () => {
    const res = await app.request("/api/auth/update-profile", {
      method: "PATCH",
      headers: authHeaders(adminToken),
      body: JSON.stringify({ name: "Updated Admin" }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.name).toBe("Updated Admin");
  });
});

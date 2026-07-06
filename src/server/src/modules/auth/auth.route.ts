/**
 * Auth routes — login, logout, me, change-password, setup.
 * Login, setup-status, and setup routes are PUBLIC (no auth middleware).
 */

import { Hono } from "hono";
import type { User } from "../../common/db/client.js";
import { UnauthorizedException } from "../../common/exceptions/http.exception.js";
import { changePassword, checkSetupStatus, getCurrentUser, login, setupFirstAdmin, updateProfile } from "./auth.service.js";

const app = new Hono();

// GET /api/auth/setup-status — PUBLIC, check if initial setup is needed
app.get("/setup-status", (c) => {
  return c.json(checkSetupStatus());
});

// POST /api/auth/setup — PUBLIC, create first admin + set timezone
app.post("/setup", async (c) => {
  const body = await c.req.json<{
    username: string;
    name: string;
    password: string;
    timezone: string;
  }>();
  const result = await setupFirstAdmin(body);
  return c.json(result);
});

// POST /api/auth/login
app.post("/login", async (c) => {
  const body = await c.req.json<{ username: string; password: string }>();
  const result = await login(body);
  return c.json(result);
});

// POST /api/auth/logout
app.post("/logout", (c) => {
  // Stateless JWT — client clears token. Server-side just acknowledges.
  return c.json({ ok: true });
});

// GET /api/auth/me — requires auth (applied globally, but this route needs it)
app.get("/me", (c) => {
  const user = (c as any).get("user") as User | undefined;
  if (!user) {
    throw new UnauthorizedException("Authentication required");
  }
  return c.json(getCurrentUser(user));
});

// PATCH /api/auth/update-profile — requires auth, update profile
app.patch("/update-profile", async (c) => {
  const user = (c as any).get("user") as User | undefined;
  if (!user) {
    throw new UnauthorizedException("Authentication required");
  }
  const body = await c.req.json<{ name?: string; avatar?: string }>();
  const result = await updateProfile(user.id, body);
  return c.json(result);
});

// POST /api/auth/change-password — requires auth
app.post("/change-password", async (c) => {
  const user = (c as any).get("user") as User | undefined;
  if (!user) {
    throw new UnauthorizedException("Authentication required");
  }
  const body = await c.req.json<{ oldPassword: string; newPassword: string }>();
  await changePassword(user.id, body);
  return c.json({ ok: true });
});

export default app;

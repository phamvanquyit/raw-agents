/**
 * Auth middleware — JWT verification + role-based access control.
 *
 * Usage in routes:
 *   app.use("*", resolveAuth);          // optional: populate c.get("user")
 *   app.use("*", requireAuth);          // 401 if not authenticated
 *   app.use("*", requireRole("admin")); // 403 if role not allowed
 */

import { eq } from "drizzle-orm";
import type { Context, Next } from "hono";
import { SignJWT, jwtVerify } from "jose";
import { getDb, users } from "../db/client.js";
import { appSettings } from "../db/schema.js";
import { ForbiddenException, UnauthorizedException } from "../exceptions/http.exception.js";

// ─── JWT Secret ───────────────────────────────────────────────────────────────

let _secret: Uint8Array | null = null;

function getJwtSecret(): Uint8Array {
  if (_secret) return _secret;

  // 1. From env
  if (process.env.JWT_SECRET) {
    _secret = new TextEncoder().encode(process.env.JWT_SECRET);
    return _secret;
  }

  // 2. From DB (persist across restarts)
  const db = getDb();
  const row = db.select().from(appSettings).where(eq(appSettings.key, "jwt_secret")).get();

  if (row) {
    _secret = new TextEncoder().encode(row.value);
    return _secret;
  }

  // 3. Auto-generate and persist
  const generated = crypto.randomUUID() + crypto.randomUUID();
  db.insert(appSettings).values({ key: "jwt_secret", value: generated, updatedAt: new Date() }).run();
  _secret = new TextEncoder().encode(generated);
  return _secret;
}

// ─── JWT Helpers ──────────────────────────────────────────────────────────────

export interface JwtPayload {
  sub: string;
  username: string;
  role: string;
}

export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(getJwtSecret());
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, getJwtSecret());
  return payload as unknown as JwtPayload;
}

// ─── Middleware ────────────────────────────────────────────────────────────────

/**
 * Resolve auth — populate c.get("user") if valid token present.
 * Does NOT throw — allows unauthenticated access.
 */
export async function resolveAuth(c: Context, next: Next) {
  const header = c.req.header("Authorization");
  if (header?.startsWith("Bearer ")) {
    const token = header.slice(7);
    try {
      const payload = await verifyToken(token);
      // Verify user still exists and is active
      const user = getDb().select().from(users).where(eq(users.id, payload.sub)).get();
      if (user?.isActive) {
        (c as any).set("user", user);
      }
    } catch {
      // Invalid token — ignore, user stays null
    }
  }
  await next();
}

/**
 * Require auth — 401 if not authenticated.
 * Must be used AFTER resolveAuth.
 */
export async function requireAuth(c: Context, next: Next) {
  const user = (c as any).get("user");
  if (!user) {
    throw new UnauthorizedException("Authentication required");
  }
  await next();
}

/**
 * Require role — 403 if user's role is not in allowed list.
 * Must be used AFTER requireAuth.
 */
export function requireRole(...roles: string[]) {
  return async (c: Context, next: Next) => {
    const user = (c as any).get("user") as { role: string } | undefined;
    if (!user) {
      throw new UnauthorizedException("Authentication required");
    }
    if (!roles.includes(user.role)) {
      throw new ForbiddenException("Insufficient permissions");
    }
    await next();
  };
}

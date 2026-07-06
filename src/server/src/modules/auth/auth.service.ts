/**
 * Auth service — login, password verification, token generation, initial setup.
 */

import { eq } from "drizzle-orm";
import { type User, appSettings, getDb, users } from "../../common/db/client.js";
import { BadRequestException } from "../../common/exceptions/http.exception.js";
import { type JwtPayload, signToken } from "../../common/middleware/auth.middleware.js";

// ─── Types ────────────────────────────────────────────────────────────────────

/** User object without password hash — safe to return to client */
export type SafeUser = Omit<User, "passwordHash">;

function toSafeUser(user: User): SafeUser {
  const { passwordHash: _, ...safe } = user;
  return safe;
}

// ─── Setup Status ─────────────────────────────────────────────────────────────

export function checkSetupStatus(): { needsSetup: boolean } {
  const userCount = getDb().select().from(users).limit(1).all();
  return { needsSetup: userCount.length === 0 };
}

// ─── Initial Setup ────────────────────────────────────────────────────────────

export async function setupFirstAdmin(body: {
  username: string;
  name: string;
  password: string;
  timezone: string;
}): Promise<{ token: string; user: SafeUser }> {
  const { username, name, password, timezone } = body;

  // Only allow setup when no users exist
  const { needsSetup } = checkSetupStatus();
  if (!needsSetup) {
    throw new BadRequestException("Setup has already been completed");
  }

  // Validate required fields
  if (!username || !password || !name) {
    throw new BadRequestException("Username, name, and password are required");
  }

  if (password.length < 8) {
    throw new BadRequestException("Password must be at least 8 characters");
  }

  if (!timezone) {
    throw new BadRequestException("Timezone is required");
  }

  const db = getDb();

  // Create admin user
  const passwordHash = await Bun.password.hash(password);
  const now = new Date();
  const id = crypto.randomUUID();

  db.insert(users)
    .values({
      id,
      username,
      name,
      passwordHash,
      role: "admin",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  // Save timezone to app settings
  db.insert(appSettings)
    .values({ key: "timezone", value: timezone, updatedAt: now })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: timezone, updatedAt: now } })
    .run();

  // Auto-login — generate JWT
  const user = db.select().from(users).where(eq(users.id, id)).get();
  if (!user) throw new BadRequestException("Failed to create user");

  const payload: JwtPayload = {
    sub: user.id,
    username: user.username,
    role: user.role,
  };
  const token = await signToken(payload);

  return { token, user: toSafeUser(user) };
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function login(body: {
  username: string;
  password: string;
}): Promise<{ token: string; user: SafeUser }> {
  const { username, password } = body;

  if (!username || !password) {
    throw new BadRequestException("Username and password are required");
  }

  // Find by username
  const user = getDb().select().from(users).where(eq(users.username, username)).get();

  if (!user) {
    throw new BadRequestException("Invalid username or password");
  }

  if (!user.isActive) {
    throw new BadRequestException("Account is disabled");
  }

  // Verify password
  const valid = await Bun.password.verify(password, user.passwordHash);
  if (!valid) {
    throw new BadRequestException("Invalid username or password");
  }

  // Generate JWT
  const payload: JwtPayload = {
    sub: user.id,
    username: user.username,
    role: user.role,
  };
  const token = await signToken(payload);

  return { token, user: toSafeUser(user) };
}

// ─── Get current user ─────────────────────────────────────────────────────────

export function getCurrentUser(user: User): SafeUser {
  return toSafeUser(user);
}

// ─── Change password ──────────────────────────────────────────────────────────

export async function changePassword(userId: string, body: { oldPassword: string; newPassword: string }): Promise<void> {
  const { oldPassword, newPassword } = body;

  if (!oldPassword || !newPassword) {
    throw new BadRequestException("Old password and new password are required");
  }

  if (newPassword.length < 8) {
    throw new BadRequestException("New password must be at least 8 characters");
  }

  const user = getDb().select().from(users).where(eq(users.id, userId)).get();

  if (!user) {
    throw new BadRequestException("User not found");
  }

  const valid = await Bun.password.verify(oldPassword, user.passwordHash);
  if (!valid) {
    throw new BadRequestException("Current password is incorrect");
  }

  const newHash = await Bun.password.hash(newPassword);
  getDb().update(users).set({ passwordHash: newHash, updatedAt: new Date() }).where(eq(users.id, userId)).run();
}

// ─── Update Profile ───────────────────────────────────────────────────────────

export async function updateProfile(userId: string, body: { name?: string; avatar?: string }): Promise<SafeUser> {
  const { name, avatar } = body;
  const db = getDb();

  db.update(users)
    .set({
      ...(name !== undefined ? { name } : {}),
      ...(avatar !== undefined ? { avatar } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .run();

  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw new BadRequestException("User not found");

  return toSafeUser(user);
}

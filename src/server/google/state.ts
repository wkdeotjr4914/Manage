import "server-only";

// OAuth CSRF state, stored in the DB (not a cookie) — same opaque-id + expiry +
// one-time-use shape as src/server/session.ts. The random id IS the `state` we
// hand to Google; the callback consumes it (looks up, deletes, checks owner+TTL).
import { randomBytes } from "node:crypto";
import { prisma } from "@/server/db";

const STATE_TTL_MS = 1000 * 60 * 10; // 10분

/**
 * Create a one-time OAuth state bound to `userId` and return its opaque id.
 * Best-effort sweeps this user's expired states first so they don't pile up.
 */
export async function createOAuthState(userId: string): Promise<string> {
  const now = Date.now();
  await prisma.oAuthState
    .deleteMany({ where: { userId, expiresAt: { lt: new Date(now) } } })
    .catch(() => {});

  const id = randomBytes(32).toString("base64url");
  await prisma.oAuthState.create({
    data: { id, userId, expiresAt: new Date(now + STATE_TTL_MS) },
  });
  return id;
}

/**
 * Consume a state on the OAuth callback: look it up, delete it unconditionally
 * (one-time use), then return true only if it existed, belongs to `userId`, and
 * hasn't expired. Any missing/mismatched/expired state returns false.
 */
export async function consumeOAuthState(
  stateId: string | null | undefined,
  userId: string,
): Promise<boolean> {
  if (!stateId) return false;
  const row = await prisma.oAuthState.findUnique({ where: { id: stateId } });
  if (!row) return false;

  // Always burn the state once looked up, even if it turns out invalid.
  await prisma.oAuthState.delete({ where: { id: stateId } }).catch(() => {});

  if (row.userId !== userId) return false;
  if (row.expiresAt.getTime() < Date.now()) return false;
  return true;
}

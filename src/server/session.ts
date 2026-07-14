import "server-only";

import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { prisma } from "@/server/db";
import {
  SESSION_COOKIE,
  signSessionId,
  verifySignedCookie,
} from "@/lib/session-crypto";
import type { CurrentUser } from "@/server/auth";

export { SESSION_COOKIE };
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7일

/** Create a DB session for `userId` and set the signed httpOnly cookie. */
export async function createSession(userId: string): Promise<void> {
  const id = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { id, userId, expiresAt } });

  const store = await cookies();
  store.set(SESSION_COOKIE, signSessionId(id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/** Delete the current session from the DB and clear the cookie. */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const sessionId = verifySignedCookie(store.get(SESSION_COOKIE)?.value);
  if (sessionId) {
    await prisma.session.deleteMany({ where: { id: sessionId } });
  }
  store.delete(SESSION_COOKIE);
}

/**
 * Resolve the signed-in user from the session cookie, or null. Verifies the
 * HMAC, looks the session up in the DB, and enforces expiry. Safe to call from
 * server components (never mutates the cookie).
 */
export async function getSessionUser(): Promise<CurrentUser> {
  const store = await cookies();
  const sessionId = verifySignedCookie(store.get(SESSION_COOKIE)?.value);
  if (!sessionId) return null;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      user: {
        select: { id: true, email: true, name: true, role: true, workspaceId: true },
      },
    },
  });
  if (!session) return null;

  if (session.expiresAt.getTime() < Date.now()) {
    // Best-effort cleanup; ignore if we're in a read-only (server component) context.
    try {
      await prisma.session.deleteMany({ where: { id: sessionId } });
    } catch {
      /* noop */
    }
    return null;
  }

  return session.user;
}

// -----------------------------------------------------------------------------
// Auth seam.
//
// This file is the SINGLE place authentication plugs in. `getCurrentUser` reads
// the session cookie (see `session.ts`); `getScope` derives the query scope from
// it. Every server action and query already routes through `getScope`, so no
// call sites change. Multi-tenant isolation is still off (`where: {}`), but the
// scope now carries the real signed-in `userId`/`workspaceId`.
// -----------------------------------------------------------------------------

import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session";

export type CurrentUser = {
  id: string;
  email: string;
  name: string | null;
  role: "MEMBER" | "ADMIN";
  workspaceId: string | null;
} | null;

export async function getCurrentUser(): Promise<CurrentUser> {
  return getSessionUser();
}

/**
 * Access scope for list/mutation queries. `where` is still an empty (no-op)
 * filter — the app behaves as a single shared workspace — but `userId`/
 * `workspaceId` now reflect the signed-in user. Later, flip `where` to
 * `{ workspaceId }` (or authorId) to enforce tenant isolation.
 */
export async function getScope() {
  const user = await getCurrentUser();
  return {
    userId: user?.id ?? null,
    workspaceId: user?.workspaceId ?? null,
    where: {} as Record<string, never>,
  };
}

/** Require a signed-in user; redirect to /login otherwise. */
export async function requireUser(): Promise<NonNullable<CurrentUser>> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Require an ADMIN; redirect to /login (anon) or / (non-admin) otherwise. */
export async function requireAdmin(): Promise<NonNullable<CurrentUser>> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/");
  return user;
}

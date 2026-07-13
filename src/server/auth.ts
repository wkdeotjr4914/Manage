// -----------------------------------------------------------------------------
// Auth seam (not wired up yet).
//
// This file is the SINGLE place authentication plugs in later. When we add
// NextAuth / company SSO, only this file changes: `getCurrentUser` starts
// returning the signed-in user, and `getScope` starts returning a real
// `where` filter. Every server action and query already routes through
// `getScope`, so no call sites need to change.
// -----------------------------------------------------------------------------

export type CurrentUser = {
  id: string;
  email: string;
  name: string | null;
  role: "MEMBER" | "ADMIN";
  workspaceId: string | null;
} | null;

export async function getCurrentUser(): Promise<CurrentUser> {
  // TODO: replace with real session lookup (NextAuth/Auth.js).
  return null;
}

/**
 * Access scope for list/mutation queries. Today it's an empty (no-op) filter,
 * so the app behaves as a single shared workspace. Later this returns
 * `{ where: { workspaceId } }` (or authorId) to enforce tenant isolation.
 */
export async function getScope() {
  const user = await getCurrentUser();
  return {
    userId: user?.id ?? null,
    workspaceId: user?.workspaceId ?? null,
    where: {} as Record<string, never>,
  };
}

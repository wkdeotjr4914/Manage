import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { consumeOAuthState } from "@/server/google/state";
import { connectGoogleAccount } from "@/server/google/token";

export const dynamic = "force-dynamic";

const SETTINGS = "/settings/integrations";

// The proxy skips /api, so this route guards itself: session required, and the
// `state` must be a live DB token that binds to the signed-in user (CSRF).
export async function GET(req: NextRequest) {
  const settingsUrl = (params: string) => new URL(`${SETTINGS}${params}`, req.url);

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const sp = req.nextUrl.searchParams;
  const redirectTo = (params: string) => NextResponse.redirect(settingsUrl(params));

  // Only reflect known OAuth error codes back into the URL — never arbitrary
  // attacker-supplied text (which would surface verbatim in the settings UI).
  const oauthError = sp.get("error");
  if (oauthError) {
    const known = new Set([
      "access_denied",
      "invalid_scope",
      "invalid_request",
      "unauthorized_client",
      "server_error",
      "temporarily_unavailable",
    ]);
    return redirectTo(`?error=${known.has(oauthError) ? oauthError : "denied"}`);
  }

  const code = sp.get("code");
  const state = sp.get("state");
  if (!code || !(await consumeOAuthState(state, user.id))) {
    return redirectTo("?error=state");
  }

  try {
    await connectGoogleAccount(user.id, code);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "구글 연결에 실패했습니다.";
    return redirectTo(`?error=${encodeURIComponent(msg)}`);
  }

  return redirectTo("?connected=1");
}

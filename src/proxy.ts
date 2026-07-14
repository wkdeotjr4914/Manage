// Next 16 renamed the `middleware` file convention to `proxy` (runs on the
// Node.js runtime by default). First line of defense for auth: if there's no
// validly-signed session cookie, bounce to /login. It only checks the HMAC
// signature (no DB access here) — real authorization is enforced per-route via
// requireUser()/requireAdmin(). See node_modules/next/dist/docs/.../proxy.md.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySignedCookie } from "@/lib/session-crypto";

export function proxy(request: NextRequest) {
  const signed = verifySignedCookie(request.cookies.get(SESSION_COOKIE)?.value);
  if (signed) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  // Preserve where the user was headed so /login can send them back.
  const dest = request.nextUrl.pathname + request.nextUrl.search;
  if (dest && dest !== "/") url.searchParams.set("next", dest);
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except the login page, Next internals, favicon, and API
  // routes — excluding /login avoids a redirect loop.
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico|api/).*)"],
};

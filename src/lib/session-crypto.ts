// HMAC signing for the session cookie value. Kept in its OWN module (only
// node:crypto, no prisma / next-headers) so `src/proxy.ts` can import the
// verifier without pulling server-only deps into the proxy bundle.
import { createHmac, timingSafeEqual } from "node:crypto";

/** Session cookie name — shared by the proxy and the server session helper. */
export const SESSION_COOKIE = "pms_session";

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_SECRET 환경변수가 설정되지 않았거나 너무 짧습니다(16자 이상). 세션 서명에 필요합니다.",
    );
  }
  return secret;
}

function sign(sessionId: string): string {
  return createHmac("sha256", getSecret()).update(sessionId).digest("base64url");
}

/** Cookie value = `<sessionId>.<hmac>`. */
export function signSessionId(sessionId: string): string {
  return `${sessionId}.${sign(sessionId)}`;
}

/**
 * Verify a signed cookie value and return the session id, or null if the
 * signature is missing/tampered. Constant-time comparison of the HMAC.
 */
export function verifySignedCookie(value: string | undefined | null): string | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const sessionId = value.slice(0, dot);
  const provided = value.slice(dot + 1);

  const expected = sign(sessionId);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? sessionId : null;
}

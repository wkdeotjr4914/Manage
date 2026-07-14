import "server-only";

// Per-user Google token lifecycle: store (encrypted), read, auto-refresh.
// Everything routes through here so callers just ask for a valid access token.
import { prisma } from "@/server/db";
import { decryptToken, encryptToken } from "@/lib/oauth-crypto";
import {
  exchangeCodeForTokens,
  fetchGoogleEmail,
  GoogleTokenError,
  refreshAccessToken,
  REVOKE_ENDPOINT,
  type GoogleTokens,
} from "./auth";
import { getGoogleOAuthConfig } from "./config";

/** 앱 OAuth 설정 로드(없으면 명확한 에러). exchange/refresh 전에 호출. */
async function requireOAuthConfig() {
  const config = await getGoogleOAuthConfig();
  if (!config) {
    throw new GoogleTokenError("구글 OAuth 앱이 설정되지 않았습니다. 관리자에게 문의하세요.");
  }
  return config;
}

// Refresh a bit before the real expiry so an in-flight API call doesn't 401.
const EXPIRY_SKEW_MS = 60_000;

/**
 * Exchange a fresh authorization code and upsert the user's GoogleAccount with
 * encrypted tokens. Requires a refresh token (offline access) — without it we
 * can't run background sync, so we reject and ask the user to reconnect.
 */
export async function connectGoogleAccount(
  userId: string,
  code: string,
): Promise<{ email: string | null }> {
  const config = await requireOAuthConfig();
  const tokens = await exchangeCodeForTokens(config, code);
  if (!tokens.refreshToken) {
    throw new GoogleTokenError(
      "리프레시 토큰을 받지 못했습니다. 구글 계정 보안 설정에서 이 앱의 접근을 해제한 뒤 다시 연결해 주세요.",
    );
  }
  const email = await fetchGoogleEmail(tokens.accessToken);
  const expiryDate = new Date(Date.now() + tokens.expiresInSec * 1000);

  const common = {
    googleEmail: email,
    scope: tokens.scope,
    accessTokenEnc: encryptToken(tokens.accessToken),
    refreshTokenEnc: encryptToken(tokens.refreshToken),
    expiryDate,
    status: "CONNECTED" as const,
  };
  await prisma.googleAccount.upsert({
    where: { userId },
    create: { userId, ...common },
    update: common,
  });
  return { email };
}

/**
 * Return a valid access token for the user, refreshing (and re-encrypting) if
 * the stored one is missing/expired. Throws GoogleTokenError if not connected,
 * revoked, or the refresh fails. On invalid_grant the account is marked REVOKED.
 */
export async function getAccessTokenForUser(
  userId: string,
  opts: { force?: boolean } = {},
): Promise<string> {
  const acct = await prisma.googleAccount.findUnique({ where: { userId } });
  if (!acct) throw new GoogleTokenError("구글 계정이 연결되어 있지 않습니다.");
  if (acct.status === "REVOKED") {
    throw new GoogleTokenError("구글 연결이 취소되었습니다. 다시 연결해 주세요.");
  }

  const stillValid =
    !opts.force &&
    acct.accessTokenEnc &&
    acct.expiryDate &&
    acct.expiryDate.getTime() - EXPIRY_SKEW_MS > Date.now();
  if (stillValid) {
    try {
      return decryptToken(acct.accessTokenEnc!);
    } catch {
      // Corrupt ciphertext — fall through and refresh from the refresh token.
    }
  }

  let refreshToken: string;
  try {
    refreshToken = decryptToken(acct.refreshTokenEnc);
  } catch {
    await markRevoked(userId);
    throw new GoogleTokenError("저장된 토큰을 복호화할 수 없습니다. 다시 연결해 주세요.");
  }

  const config = await requireOAuthConfig();
  let tokens: GoogleTokens;
  try {
    tokens = await refreshAccessToken(config, refreshToken);
  } catch (e) {
    if (e instanceof GoogleTokenError && e.oauthError === "invalid_grant") {
      await markRevoked(userId);
    }
    throw e;
  }

  await prisma.googleAccount.update({
    where: { userId },
    data: {
      accessTokenEnc: encryptToken(tokens.accessToken),
      expiryDate: new Date(Date.now() + tokens.expiresInSec * 1000),
      // Google rarely re-issues a refresh token on refresh; keep the old one.
      ...(tokens.refreshToken ? { refreshTokenEnc: encryptToken(tokens.refreshToken) } : {}),
      scope: tokens.scope ?? acct.scope,
      status: "CONNECTED",
    },
  });
  return tokens.accessToken;
}

/** 접근이 취소된(또는 복구 불가) 계정을 REVOKED로 마킹 → UI/크론이 스킵. */
export async function markRevoked(userId: string): Promise<void> {
  // updateMany(단건 update 아님): 레코드가 이미 삭제됐어도 throw하지 않게.
  await prisma.googleAccount.updateMany({
    where: { userId },
    data: { status: "REVOKED" },
  });
}

/** 연결 해제: 구글에 best-effort revoke 요청 후 로컬 레코드 삭제. */
export async function disconnectGoogleAccount(userId: string): Promise<void> {
  const acct = await prisma.googleAccount.findUnique({ where: { userId } });
  if (!acct) return;
  try {
    const token = decryptToken(acct.refreshTokenEnc);
    await fetch(REVOKE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(10_000),
    }).catch((e) => console.warn("[google] revoke 요청 실패", e));
  } catch {
    // 복호화 실패해도 로컬 삭제는 진행.
  }
  await prisma.googleAccount.delete({ where: { userId } });
}

import "server-only";

// 앱 전역 구글 OAuth 클라이언트 자격증명(client_id/secret/redirect_uri) 관리.
// 사용자별이 아니라 앱 전체가 공유하는 값이라 DB 1행(OAuthClientConfig, provider PK).
// ADMIN이 설정 화면에서 입력하며 secret은 AES-256-GCM 암호문으로 저장. 이 행이 없으면
// .env의 GOOGLE_* 를 폴백으로 쓴다(배포/CI에서 env 주입도 계속 지원).
import { prisma } from "@/server/db";
import { encryptToken, decryptToken } from "@/lib/oauth-crypto";
import type { GoogleOAuthConfig } from "./auth";

const PROVIDER = "google";

function envConfig(): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (clientId && clientSecret && redirectUri) return { clientId, clientSecret, redirectUri };
  return null;
}

/** 유효한 OAuth 클라이언트 설정(복호화 포함). DB 우선, 없으면 env 폴백, 둘 다 없으면 null. */
export async function getGoogleOAuthConfig(): Promise<GoogleOAuthConfig | null> {
  const row = await prisma.oAuthClientConfig.findUnique({ where: { provider: PROVIDER } });
  if (row) {
    try {
      return {
        clientId: row.clientId,
        clientSecret: decryptToken(row.clientSecretEnc),
        redirectUri: row.redirectUri,
      };
    } catch {
      // 복호화 실패(키 회전 등) → env 폴백으로 넘어감.
    }
  }
  return envConfig();
}

/** 연결 버튼 활성/비활성 판단용(g2b의 isG2bAvailable 패턴). */
export async function isGoogleOAuthConfigured(): Promise<boolean> {
  return (await getGoogleOAuthConfig()) !== null;
}

/** ADMIN 설정 화면 표시용 상태 — secret은 절대 반환하지 않는다. */
export type GoogleOAuthConfigStatus = {
  configured: boolean;
  source: "db" | "env" | null;
  clientId: string | null;
  redirectUri: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
};

export async function getGoogleOAuthConfigStatus(): Promise<GoogleOAuthConfigStatus> {
  const row = await prisma.oAuthClientConfig.findUnique({ where: { provider: PROVIDER } });
  if (row) {
    return {
      configured: true,
      source: "db",
      clientId: row.clientId,
      redirectUri: row.redirectUri,
      updatedBy: row.updatedBy,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
  const env = envConfig();
  if (env) {
    return {
      configured: true,
      source: "env",
      clientId: env.clientId,
      redirectUri: env.redirectUri,
      updatedBy: null,
      updatedAt: null,
    };
  }
  return { configured: false, source: null, clientId: null, redirectUri: null, updatedBy: null, updatedAt: null };
}

/**
 * ADMIN이 앱 설정 저장. secret이 비어 있으면(빈 문자열) 기존 secret을 유지한다
 * (수정 화면에서 secret을 다시 입력하지 않아도 되도록). 최초 저장 시엔 secret 필수.
 */
export async function saveGoogleOAuthConfig(
  input: { clientId: string; redirectUri: string; clientSecret?: string },
  updatedBy: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const existing = await prisma.oAuthClientConfig.findUnique({
    where: { provider: PROVIDER },
    select: { clientSecretEnc: true },
  });

  let clientSecretEnc: string;
  if (input.clientSecret) {
    clientSecretEnc = encryptToken(input.clientSecret);
  } else if (existing) {
    clientSecretEnc = existing.clientSecretEnc; // 기존 secret 유지
  } else {
    return { ok: false, error: "client secret을 입력하세요." };
  }

  await prisma.oAuthClientConfig.upsert({
    where: { provider: PROVIDER },
    create: {
      provider: PROVIDER,
      clientId: input.clientId,
      clientSecretEnc,
      redirectUri: input.redirectUri,
      updatedBy,
    },
    update: {
      clientId: input.clientId,
      clientSecretEnc,
      redirectUri: input.redirectUri,
      updatedBy,
    },
  });
  return { ok: true };
}

/** ADMIN이 DB 설정 삭제(이후 env 폴백 또는 미설정으로 되돌아감). */
export async function clearGoogleOAuthConfig(): Promise<void> {
  await prisma.oAuthClientConfig.deleteMany({ where: { provider: PROVIDER } });
}

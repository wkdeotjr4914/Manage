import "server-only";

// Google OAuth 2.0 core (Authorization Code flow). Dependency-free — the token
// endpoints are plain form POSTs, mirroring how src/server/g2b/client.ts and
// src/server/import/ai.ts call external REST with fetch + AbortSignal.timeout.
// The CSRF `state` is a DB-backed one-time token (see ./state.ts), not a cookie.

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";
export const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

// Scopes:
//  - gmail.readonly : 메일 수집(읽기 전용)
//  - calendar       : 전용 "PMS 일정" 보조 캘린더 생성 + 이벤트 CRUD
//                     (calendar.events는 캘린더 생성 불가라 full calendar 사용)
//  - spreadsheets   : 리포트 시트 생성/쓰기
//  - openid email   : 연결된 구글 계정 이메일 표시
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/spreadsheets",
] as const;

/** OAuth 토큰 교환/갱신 실패. `oauthError`가 "invalid_grant"면 접근 취소로 간주. */
export class GoogleTokenError extends Error {
  oauthError?: string;
  constructor(message: string, oauthError?: string) {
    super(message);
    this.name = "GoogleTokenError";
    this.oauthError = oauthError;
  }
}

export type GoogleTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresInSec: number;
  scope: string | null;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

// 앱 전역 OAuth 클라이언트 자격증명. 예전엔 env에서 읽었지만 이제 DB(config.ts)에서
// 로드해 파라미터로 주입한다 — auth.ts는 프로토콜만 담당(prisma 미의존).
export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

/** Authorization URL — offline access + forced consent so a refresh token is issued. */
export function buildAuthUrl(config: GoogleOAuthConfig, state: string): string {
  const qs = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_ENDPOINT}?${qs.toString()}`;
}

async function tokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  let res: Response;
  try {
    res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") {
      throw new GoogleTokenError("구글 인증 서버 응답 시간이 초과되었습니다.");
    }
    throw new GoogleTokenError("구글 인증 서버에 연결할 수 없습니다.");
  }

  const text = await res.text();
  let json: TokenResponse;
  try {
    json = JSON.parse(text) as TokenResponse;
  } catch {
    throw new GoogleTokenError(`구글 토큰 응답 파싱 실패: ${text.slice(0, 120)}`);
  }

  if (!res.ok || json.error) {
    // 원본 오류는 서버 로그에만(토큰/비밀 노출 방지), 사용자에겐 한국어 요약.
    console.error("[google] token error", res.status, json.error, json.error_description);
    if (json.error === "invalid_grant") {
      throw new GoogleTokenError(
        "구글 연결이 만료되었거나 취소되었습니다. 다시 연결해 주세요.",
        "invalid_grant",
      );
    }
    throw new GoogleTokenError(
      `구글 인증 오류: ${json.error_description ?? json.error ?? `HTTP ${res.status}`}`,
      json.error,
    );
  }
  if (!json.access_token) {
    throw new GoogleTokenError("구글이 access token을 반환하지 않았습니다.");
  }
  return json;
}

function toTokens(json: TokenResponse): GoogleTokens {
  return {
    accessToken: json.access_token as string,
    refreshToken: json.refresh_token ?? null,
    expiresInSec: Number(json.expires_in ?? 3600),
    scope: json.scope ?? null,
  };
}

/** 콜백에서 받은 code를 토큰으로 교환. 최초 동의 시 refresh_token 포함. */
export async function exchangeCodeForTokens(
  config: GoogleOAuthConfig,
  code: string,
): Promise<GoogleTokens> {
  return toTokens(
    await tokenRequest(
      new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
      }),
    ),
  );
}

/** refresh_token으로 access token 갱신. 보통 새 refresh_token은 오지 않음. */
export async function refreshAccessToken(
  config: GoogleOAuthConfig,
  refreshToken: string,
): Promise<GoogleTokens> {
  return toTokens(
    await tokenRequest(
      new URLSearchParams({
        refresh_token: refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "refresh_token",
      }),
    ),
  );
}

/** 연결된 구글 계정 이메일(표시용). 실패해도 연결 자체는 막지 않음 → null. */
export async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { email?: string };
    return json.email ?? null;
  } catch {
    return null;
  }
}

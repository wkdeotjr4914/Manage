import "server-only";

// Shared authenticated Google REST helper. Mirrors the status-code error style
// of src/server/import/ai.ts: log raw errors server-side, surface short Korean
// messages. Refreshes the access token once on a 401 and retries.
import { getAccessTokenForUser } from "./token";

export class GoogleApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "GoogleApiError";
    this.status = status;
  }
}

/**
 * Authenticated fetch for a user's Google API call. On 401 it forces a token
 * refresh once and retries. Callers pass a plain RequestInit (no Authorization).
 */
export async function googleApiFetch(
  userId: string,
  url: string,
  init: RequestInit = {},
  retried = false,
): Promise<Response> {
  const token = await getAccessTokenForUser(userId, { force: retried });
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") {
      throw new GoogleApiError("구글 API 응답 시간이 초과되었습니다.");
    }
    throw new GoogleApiError("구글 API에 연결할 수 없습니다.");
  }

  if (res.status === 401 && !retried) {
    return googleApiFetch(userId, url, init, true);
  }
  return res;
}

/** Read a JSON response, throwing a GoogleApiError with Korean context on failure. */
export async function googleJson<T>(res: Response, context: string): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    console.error(`[google] ${context} ${res.status}:`, text.slice(0, 300));
    if (res.status === 401 || res.status === 403) {
      throw new GoogleApiError(`${context}: 구글 API 접근 권한이 없습니다.`, res.status);
    }
    if (res.status === 429) {
      throw new GoogleApiError(`${context}: 구글 API 호출 한도를 초과했습니다.`, res.status);
    }
    throw new GoogleApiError(`${context}: 구글 API 오류(HTTP ${res.status}).`, res.status);
  }
  if (!text) return undefined as T; // 204 No Content 등
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new GoogleApiError(`${context}: 응답 파싱에 실패했습니다.`);
  }
}

/** POST/PUT JSON helper. */
export function jsonBody(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

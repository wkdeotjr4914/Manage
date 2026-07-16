import "server-only";

// 좁은 메일-분석 프록시(/analyze) 호출. VPS에서 Hermes 옆에 뜬 프록시가 "메일 → 업무"만
// 노출하고, Hermes의 RCE 가능한 /v1 API는 인터넷에 노출하지 않는다. 설정 방법은
// hermes-proxy/README.md 참고. 미설정(HERMES_PROXY_URL/KEY 없음) 시 에이전트 경로는 꺼진다.

function proxyUrl(): string | undefined {
  return process.env.HERMES_PROXY_URL;
}
function proxyKey(): string | undefined {
  return process.env.HERMES_PROXY_KEY;
}

/** 에이전트(Hermes 프록시) 경로를 쓸 수 있는지 — isAiAvailable()의 대응물. */
export function isHermesProxyAvailable(): boolean {
  return Boolean(proxyUrl() && proxyKey());
}

/** 프록시 /analyze 호출. 원시 tasks 배열을 반환(정규화는 호출측 normalizeMailTasks).
 *  프록시는 빈 결과 시 내부적으로 재시도하므로 왕복이 길 수 있어 타임아웃을 넉넉히 둔다. */
export async function analyzeMailViaProxy(
  mailText: string,
  projectName: string,
): Promise<unknown[]> {
  const url = proxyUrl();
  const key = proxyKey();
  if (!url || !key) {
    throw new Error("HERMES_PROXY_URL·HERMES_PROXY_KEY 가 설정되지 않았습니다.");
  }
  const res = await fetch(`${url.replace(/\/$/, "")}/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ mailText, projectName }),
    signal: AbortSignal.timeout(150_000),
  });
  const data = (await res.json().catch(() => null)) as
    | { ok: true; tasks: unknown[] }
    | { ok: false; error: string }
    | null;
  if (!res.ok || !data || data.ok !== true) {
    const msg =
      data && data.ok === false ? data.error : `에이전트 프록시 오류(${res.status}).`;
    throw new Error(msg);
  }
  return Array.isArray(data.tasks) ? data.tasks : [];
}

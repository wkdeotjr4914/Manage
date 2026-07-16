import "server-only";

// Hermes 에이전트와 Discord REST(v10) 경유로 주고받는 저수준 유틸.
// scripts/hermes-discord-test.ts 의 검증된 로직(429 재시도·폴링·JSON 추출)을 앱 코드로 이식.
// 봇 토큰은 서버에서만 읽는다(클라이언트에 노출 금지 → "server-only").

const API = "https://discord.com/api/v10";

function botToken(): string | undefined {
  return process.env.DISCORD_BOT_TOKEN;
}

/** 에이전트가 대기하는 채널 id. 전용 키 우선, 없으면 홈/테스트 채널로 폴백. */
export function agentChannelId(): string | undefined {
  return (
    process.env.DISCORD_AGENT_CHANNEL_ID ||
    process.env.DISCORD_HOME_CHANNEL ||
    process.env.DISCORD_TEST_CHANNEL_ID
  );
}

/** 에이전트(Hermes) 경로를 쓸 수 있는지 — isAiAvailable()의 대응물. */
export function isAgentAvailable(): boolean {
  return Boolean(botToken() && agentChannelId());
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Discord REST 호출. 429는 retry_after 만큼 기다렸다 최대 5회 자동 재시도. */
async function discordRequest(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = botToken();
  if (!token) throw new Error("DISCORD_BOT_TOKEN 이 설정되지 않았습니다.");
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 429) {
      const body = (await res.json().catch(() => ({}))) as {
        retry_after?: number;
      };
      await sleep(Math.ceil((body.retry_after ?? 1) * 1000) + 250);
      continue;
    }
    return res;
  }
  throw new Error("Discord API 요청이 반복적으로 레이트리밋(429)되었습니다.");
}

export type AgentMessage = {
  id: string;
  content: string;
  author: { id: string; username: string; bot?: boolean };
  timestamp: string;
};

/** 에이전트 채널에 메시지를 보내고, 방금 보낸 메시지 id를 반환(폴링 커서 기준선). */
export async function postAgentMessage(
  content: string,
): Promise<{ messageId: string; channelId: string }> {
  const channelId = agentChannelId();
  if (!channelId)
    throw new Error("에이전트 채널(DISCORD_AGENT_CHANNEL_ID 등)이 설정되지 않았습니다.");
  const res = await discordRequest(`/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Discord 메시지 전송 실패(${res.status}). ${detail}`.trim());
  }
  const msg = (await res.json()) as AgentMessage;
  return { messageId: msg.id, channelId };
}

/** 커서(메시지 id) 이후에 도착한 메시지들을 오래된 순으로 반환. */
export async function fetchMessagesAfter(
  channelId: string,
  after: string,
): Promise<AgentMessage[]> {
  const res = await discordRequest(
    `/channels/${channelId}/messages?after=${after}&limit=20`,
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Discord 메시지 조회 실패(${res.status}). ${detail}`.trim());
  }
  // Discord는 최신순(내림차순)으로 준다 → 오래된 순으로 뒤집어 처리.
  const arr = (await res.json()) as AgentMessage[];
  return arr.slice().reverse();
}

/** 코드펜스·앞뒤 잡설을 벗겨내고 JSON 파싱을 시도. 실패 시 null. */
export function extractJson(text: string): unknown | null {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch {
    /* fall through */
  }
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(t.slice(first, last + 1));
    } catch {
      /* give up */
    }
  }
  return null;
}

/** 두 snowflake id 비교 (a > b 이면 양수). 커서 전진에 사용.
 *  BigInt 리터럴을 피해(빌드 target 호환) 길이+사전순으로 비교한다 — snowflake는 0-패딩 없는
 *  양의 정수 문자열이라 "자릿수 많을수록 큼, 같으면 사전순 = 숫자순"이 성립. */
export function cmpId(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length;
  return a < b ? -1 : a > b ? 1 : 0;
}

import "dotenv/config";

/**
 * 일회용 실측 스크립트 (커밋 전 실험용, 앱 코드와 무관).
 * "앱 → Discord 채널 → Hermes(두뇌) → Discord 채널 → 앱" 왕복이 쓸 만한지 검증한다.
 * 계획: ~/.claude/plans/discord-squishy-hamster.md
 *
 * 하는 일
 *   - Discord REST v10 로 Hermes home 채널에 앱의 실제 분석 프롬프트(analyzeMailTasks 동형)를 넣고,
 *     Hermes 봇이 남기는 답장을 폴링해서 JSON 으로 파싱 → 왕복 지연/성공 여부를 출력.
 *   - 봇 토큰은 Hermes 것을 "재사용"한다. 즉 전송 메시지의 작성자 = Hermes 봇 자신이라,
 *     대부분의 에이전트는 자기 메시지를 무시(무한루프 방지)해서 트리거가 안 걸릴 수 있다.
 *     → 그래서 두 모드를 둔다.
 *
 * 모드
 *   (기본) 자기 트리거 프로브 : 봇으로 프롬프트를 POST 하고, 봇(=Hermes)이 자기 메시지에 답하는지 본다.
 *   --read-only              : 아무것도 안 보낸다. 지금 시점을 기준선으로 잡고, "사람 계정"으로 채널에
 *                              트리거 메시지를 직접 올리면, 스크립트는 Hermes 답장만 폴링·파싱한다.
 *                              (전송 신원 문제를 우회해 '프로그램 수신+파싱' 절반을 검증)
 *
 * 실행
 *   로컬 .env 에 아래를 채운 뒤 (둘 다 VPS /opt/data/.env 에 있음):
 *     DISCORD_BOT_TOKEN=...            # Hermes 봇 토큰
 *     DISCORD_TEST_CHANNEL_ID=...      # 대상 채널 id (없으면 DISCORD_HOME_CHANNEL 사용)
 *   npx tsx scripts/hermes-discord-test.ts               # 자기 트리거 프로브
 *   npx tsx scripts/hermes-discord-test.ts --read-only   # 읽기 전용(사람이 트리거)
 *
 * 선택 env
 *   HERMES_TEST_TIMEOUT_MS  폴링 총 대기(기본 120000)
 *   HERMES_TEST_POLL_MS     폴링 간격(기본 3000)
 */

const API = "https://discord.com/api/v10";
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL =
  process.env.DISCORD_TEST_CHANNEL_ID || process.env.DISCORD_HOME_CHANNEL;
const TIMEOUT_MS = Number(process.env.HERMES_TEST_TIMEOUT_MS ?? 120_000);
const POLL_MS = Number(process.env.HERMES_TEST_POLL_MS ?? 3_000);
const READ_ONLY = process.argv.includes("--read-only");

// 앱의 analyzeMailTasks 가 보내는 것과 동형: mailTaskSystemPrompt + 짧은 샘플 메일 +
// "순수 JSON만" 지시 + MAIL_TASKS_SCHEMA 요약. (Discord 2000자 한도 안에 들도록 짧게)
const PROMPT = `당신은 이메일 한 통을 분석해 '샘플 프로젝트' 프로젝트의 실행 업무로 분해하는 PM 어시스턴트입니다.
주어진 메일 본문에서 실제 '할 일/요청/액션'을 찾아 업무 단위로 나눠 JSON으로 반환하세요.

규칙:
- 의미 있는 업무 단위로 나눔. 인사말·서명·잡담·단순 정보 공유는 제외.
- 각 업무: title(한 줄, 한국어, 필수), description(1~3줄, 선택), status(TODO 또는 DONE), priority(LOW/MEDIUM/HIGH/URGENT), dueDate(기한 명시 시에만 YYYY-MM-DD).
- 근거 없는 값은 지어내지 말 것. 추출할 업무가 없으면 tasks: [] 로.

★ 출력은 아래 형태의 "순수 JSON"만. 코드펜스나 설명 문장을 붙이지 말 것.
{"tasks":[{"title":"...","description":"...","status":"TODO","priority":"MEDIUM","dueDate":"2026-07-20"}]}

<email>
제목: 홈페이지 리뉴얼 관련 요청
보낸사람: 김대리 <kim@example.com>
날짜: 2026-07-15

안녕하세요. 다음 주까지 메인 배너 시안 3개 부탁드립니다.
그리고 결제 모듈 오류(장바구니에서 결제 시 500 에러)를 이번 주 금요일까지 급하게 수정해야 합니다.
지난주 킥오프 회의는 이미 완료했습니다. 감사합니다.
</email>`;

type DiscordMessage = {
  id: string;
  content: string;
  author: { id: string; username: string; bot?: boolean };
  timestamp: string;
  referenced_message?: { id: string } | null;
  thread?: unknown;
};

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`❌ ${msg}`);
    process.exit(1);
  }
}

/** Discord REST 호출. 429는 retry_after 만큼 기다렸다 자동 재시도. */
async function discord(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bot ${TOKEN}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 429) {
      const body = (await res.json().catch(() => ({}))) as {
        retry_after?: number;
      };
      const waitMs = Math.ceil((body.retry_after ?? 1) * 1000) + 250;
      console.warn(`   · 429 rate limit → ${waitMs}ms 대기 후 재시도`);
      await sleep(waitMs);
      continue;
    }
    return res;
  }
  throw new Error("Discord 429 재시도 한도 초과");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 코드펜스/앞뒤 잡설을 벗겨내고 JSON 파싱을 시도. 실패 시 null. */
function extractJson(text: string): unknown | null {
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

function preview(s: string, n = 140) {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n) + "…" : one;
}

/** 두 snowflake id 비교 (a > b 이면 양수). 길이+사전순(snowflake는 0-패딩 없는 양의 정수 문자열). */
function cmpId(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length;
  return a < b ? -1 : a > b ? 1 : 0;
}

async function main() {
  assert(TOKEN, "DISCORD_BOT_TOKEN 이 없습니다. 로컬 .env 에 Hermes 봇 토큰을 넣으세요.");
  assert(
    CHANNEL,
    "DISCORD_TEST_CHANNEL_ID (또는 DISCORD_HOME_CHANNEL) 이 없습니다. 대상 채널 id를 넣으세요.",
  );
  assert(PROMPT.length <= 2000, `프롬프트가 2000자를 넘습니다(${PROMPT.length}).`);

  // 봇 자신(=Hermes)의 user id. 답장 식별에 사용.
  const meRes = await discord("/users/@me");
  assert(meRes.ok, `GET /users/@me 실패(${meRes.status}). 토큰을 확인하세요.`);
  const me = (await meRes.json()) as { id: string; username: string };
  console.log(`🤖 봇 = ${me.username} (id ${me.id})`);
  console.log(`#  채널 = ${CHANNEL}`);
  console.log(
    `⏱  모드 = ${READ_ONLY ? "읽기 전용(사람이 트리거)" : "자기 트리거 프로브"}, ` +
      `타임아웃 ${TIMEOUT_MS}ms, 폴링 ${POLL_MS}ms\n`,
  );

  // 기준선(after cursor): 이 id "이후"에 온 메시지만 본다.
  let cursor: string;

  if (READ_ONLY) {
    // 지금 채널의 최신 메시지를 기준선으로. 이후 사람이 트리거 → Hermes 답장을 잡는다.
    const latest = await discord(`/channels/${CHANNEL}/messages?limit=1`);
    assert(latest.ok, `채널 메시지 조회 실패(${latest.status}).`);
    const arr = (await latest.json()) as DiscordMessage[];
    cursor = arr[0]?.id ?? "0";
    console.log("👉 이제 '사람 계정'으로 채널에 트리거 메시지를 올리세요.");
    console.log("   (Phase 1 프롬프트를 그대로 붙여넣으면 됩니다. 이 스크립트가 답장을 기다립니다.)\n");
  } else {
    // 봇으로 프롬프트 전송. 반환된 메시지 id 가 곧 기준선.
    const sent = await discord(`/channels/${CHANNEL}/messages`, {
      method: "POST",
      body: JSON.stringify({ content: PROMPT }),
    });
    if (!sent.ok) {
      const errText = await sent.text().catch(() => "");
      assert(
        false,
        `메시지 전송 실패(${sent.status}). 봇이 채널에 접근/전송 권한이 있는지 확인하세요. ${errText}`,
      );
    }
    const msg = (await sent.json()) as DiscordMessage;
    cursor = msg.id;
    console.log(`📤 프롬프트 전송됨 (msg ${msg.id}). Hermes 답장 대기…\n`);
  }

  const started = Date.now();
  while (Date.now() - started < TIMEOUT_MS) {
    await sleep(POLL_MS);

    const res = await discord(
      `/channels/${CHANNEL}/messages?after=${cursor}&limit=20`,
    );
    if (!res.ok) {
      console.warn(`   · 폴링 실패(${res.status}), 계속 시도`);
      continue;
    }
    // Discord 는 최신순(내림차순)으로 준다 → 오래된 순으로 뒤집어 처리.
    const msgs = ((await res.json()) as DiscordMessage[]).slice().reverse();

    for (const m of msgs) {
      if (cmpId(m.id, cursor) > 0) cursor = m.id; // 커서 전진

      const tag = `${m.author.username}${m.author.bot ? "(봇)" : ""}`;
      console.log(`   ⬦ ${tag}: ${preview(m.content) || "(내용 없음/빈 content)"}`);

      // 앱(pollMailTasksViaAgent)과 동일: 커서 이후 메시지 중 JSON이 파싱되는 것을
      // Hermes 답으로 본다(작성자 무관). 우리가 보낸 프롬프트는 커서 기준선이라 이미 제외됨.

      const parsed = extractJson(m.content);
      if (parsed) {
        const elapsed = Date.now() - started;
        const tasks = (parsed as { tasks?: unknown[] })?.tasks;
        console.log("\n✅ 성공 — Hermes 답장을 JSON 으로 파싱했습니다.");
        console.log(`   왕복 지연 ≈ ${(elapsed / 1000).toFixed(1)}s`);
        console.log(
          `   tasks 개수 = ${Array.isArray(tasks) ? tasks.length : "(tasks 필드 없음)"}`,
        );
        console.log("   --- 파싱 결과 ---");
        console.log(JSON.stringify(parsed, null, 2));
        return;
      }
      // 봇이 답은 했지만 JSON 이 아님 → ② 파싱 방어 필요. 원문을 남긴다.
      console.log("   ⚠️ 봇이 답했지만 JSON 파싱 실패. 원문:");
      console.log("   " + m.content);
    }
  }

  console.log("\n⌛ 타임아웃 — 유효한 답장을 받지 못했습니다.");
  if (!READ_ONLY) {
    console.log("   ↳ 봇이 '자기 메시지'를 무시했을 가능성(리스크 ①). --read-only 로 다시 시도하세요:");
    console.log("     npx tsx scripts/hermes-discord-test.ts --read-only");
  }
  console.log("   ↳ 혹은 Hermes 가 스레드로 답했을 수 있습니다(리스크 ⑤). 채널의 스레드를 확인하세요.");
  process.exit(2);
}

main().catch((e) => {
  console.error("❌ 예외:", e instanceof Error ? e.message : e);
  process.exit(1);
});

"use server";

// AI classification for the KakaoTalk import page. Two engines feed the SAME
// merge/match builder (`buildKakaoGroups` in @/lib/kakao):
//  - Gemini  — `analyzeKakaoChat` chunks the whole conversation and calls Gemini
//    per chunk sequentially (server-side loop), then builds the groups.
//  - Hermes agent — `analyzeKakaoChunkViaHermes` analyzes ONE chunk through the
//    narrow proxy. Hermes is slow (~70s/18KB chunk), so the CLIENT drives the
//    per-chunk loop (keeping each serverless call short) and calls
//    `buildKakaoGroups` on the accumulated raw groups itself.

import { prisma } from "@/server/db";
import { getScope } from "@/server/auth";
import { isAiAvailable, callGemini } from "@/server/import/ai";
import {
  isHermesProxyAvailable,
  analyzeKakaoChunkViaProxy,
} from "@/server/agent/hermesProxy";
import {
  chunkMessages,
  messagesToText,
  buildKakaoGroups,
  KAKAO_MAX_CHUNKS,
  type KakaoMessage,
  type KakaoRawGroup,
  type AnalyzeKakaoResult,
} from "@/lib/kakao";
import { TASK_STATUS_VALUES, TASK_PRIORITY_VALUES } from "@/lib/validation";

const UNASSIGNED = "미분류";

// Gemini structured-output schema for one chunk. Types are UPPER-CASE per the
// generativelanguage v1beta contract (see src/server/import/ai.ts).
const CHUNK_SCHEMA = {
  type: "OBJECT",
  properties: {
    groups: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          projectName: { type: "STRING" },
          summary: { type: "STRING" },
          tasks: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                title: { type: "STRING" },
                status: { type: "STRING", enum: [...TASK_STATUS_VALUES] },
                priority: { type: "STRING", enum: [...TASK_PRIORITY_VALUES] },
                description: { type: "STRING" },
              },
              required: ["title"],
            },
          },
          requirements: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                name: { type: "STRING" },
                category: { type: "STRING" },
                detail: { type: "STRING" },
                acceptance: { type: "STRING" },
                requestDate: { type: "STRING", description: "YYYY-MM-DD" },
                dueDate: { type: "STRING", description: "YYYY-MM-DD" },
                targetDate: { type: "STRING", description: "YYYY-MM-DD" },
              },
              required: ["name"],
            },
          },
        },
        required: ["projectName"],
      },
    },
  },
  required: ["groups"],
};

function systemPrompt(projectNames: string[]): string {
  const list = projectNames.length
    ? projectNames.map((n) => `- ${n}`).join("\n")
    : "(등록된 프로젝트 없음)";
  return `당신은 회사 단체 카카오톡 대화를 분석해 "프로젝트별 업무"로 분류하는 PM 어시스턴트입니다.
아래 [기존 프로젝트 목록]을 기준으로, 주어진 대화 구간에서 실제 업무를 추출해 프로젝트별로 묶어 JSON으로 반환하세요.

규칙:
- 대화가 특정 프로젝트에 해당하면 projectName에 [기존 프로젝트 목록]의 이름을 표기 그대로 쓰세요.
- 업무성 내용이지만 어느 프로젝트에도 속하지 않으면 projectName="${UNASSIGNED}".
- 주차 등록·쓰레기봉투·휴가·식사·인사·잡담 등 업무와 무관한 내용은 모두 제외하세요.
- 실제 업무(개발/배포/수정/버그/요청/일정/회의 결정)만 추출합니다.
- 각 프로젝트 그룹에 대해:
  - summary: 해당 프로젝트 관련 대화 요약 3~6줄(한국어).
  - tasks: 할 일/액션 항목. title 필수. status는 대개 TODO(이미 끝났으면 DONE), priority는 LOW/MEDIUM/HIGH/URGENT.
  - requirements: 요구사항/과업으로 볼 만한 것. name 필수. 날짜가 있으면 YYYY-MM-DD.
- 근거가 없는 값은 지어내지 말고 빈 배열로 두세요. 추출할 업무가 전혀 없으면 groups를 빈 배열로 반환하세요.

[기존 프로젝트 목록]
${list}`;
}

export async function analyzeKakaoChat(input: {
  messages: KakaoMessage[];
  roomName: string;
}): Promise<AnalyzeKakaoResult> {
  if (!isAiAvailable()) {
    return { ok: false, error: "AI 분류에는 GEMINI_API_KEY가 필요합니다." };
  }
  const messages = input.messages ?? [];
  if (!messages.length) {
    return { ok: false, error: "분석할 메시지가 없습니다." };
  }
  if (messages.length > 50000) {
    return {
      ok: false,
      error: "대화가 너무 큽니다(메시지 5만 건 초과). 기간을 나눠 내보낸 파일로 시도하세요.",
    };
  }

  const scope = await getScope();
  const projects = await prisma.project.findMany({
    where: scope.where,
    select: { id: true, name: true },
    orderBy: { createdAt: "desc" },
  });
  const system = systemPrompt(projects.map((p) => p.name));

  const allChunks = chunkMessages(messages);
  const truncated = allChunks.length > KAKAO_MAX_CHUNKS;
  const chunks = truncated ? allChunks.slice(0, KAKAO_MAX_CHUNKS) : allChunks;

  // Sequential: Gemini free/low tiers 429 easily and 60s-per-call parallelism
  // wouldn't shorten wall-clock meaningfully. One failed chunk is skipped.
  const allRaw: KakaoRawGroup[] = [];
  let partialFailures = 0;
  for (const chunk of chunks) {
    let raw: unknown;
    try {
      raw = await callGemini(
        [
          {
            text: `다음은 대화의 일부입니다(YYYY-MM-DD HH:mm 발화자: 내용).\n\n<chat>\n${messagesToText(chunk)}\n</chat>`,
          },
        ],
        { system, schema: CHUNK_SCHEMA, maxOutputTokens: 24576 },
      );
    } catch (e) {
      console.error("[actions/kakao] chunk 분석 실패:", e);
      partialFailures++;
      continue;
    }
    const groups = (raw as { groups?: KakaoRawGroup[] })?.groups ?? [];
    allRaw.push(...groups);
  }

  const groups = buildKakaoGroups(allRaw, projects);

  if (!groups.length && partialFailures === chunks.length) {
    return { ok: false, error: "AI 분석에 모두 실패했습니다. 잠시 후 다시 시도하세요." };
  }

  return { ok: true, groups, partialFailures, truncated };
}

/**
 * Analyze ONE conversation chunk through the Hermes proxy and return its RAW
 * groups (no merge/match). The client loops over chunks, accumulates the raw
 * groups, and runs `buildKakaoGroups` once at the end — this keeps each
 * serverless invocation to a single ~70s proxy round-trip. The project name
 * list (for the prompt) is derived server-side from the scoped projects.
 */
export async function analyzeKakaoChunkViaHermes(input: {
  chatText: string;
}): Promise<{ ok: true; groups: KakaoRawGroup[] } | { ok: false; error: string }> {
  if (!isHermesProxyAvailable()) {
    return {
      ok: false,
      error: "에이전트 연동(HERMES_PROXY_URL·HERMES_PROXY_KEY)이 설정되지 않았습니다.",
    };
  }
  const chatText = typeof input?.chatText === "string" ? input.chatText : "";
  if (!chatText.trim()) {
    return { ok: false, error: "분석할 대화가 없습니다." };
  }
  // Server-side guard mirroring the client chunk size (the proxy also caps at
  // 60KB) so a direct action call can't push an oversized body at Hermes.
  if (chatText.length > 60000) {
    return { ok: false, error: "청크가 너무 큽니다(6만 자 초과)." };
  }

  const scope = await getScope();
  const projects = await prisma.project.findMany({
    where: scope.where,
    select: { name: true },
    orderBy: { createdAt: "desc" },
  });

  try {
    const groups = await analyzeKakaoChunkViaProxy(
      chatText,
      projects.map((p) => p.name),
    );
    return { ok: true, groups: groups as KakaoRawGroup[] };
  } catch (e) {
    console.error("[actions/kakao] 에이전트(프록시) 청크 분석 실패:", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "에이전트 분석에 실패했습니다.",
    };
  }
}

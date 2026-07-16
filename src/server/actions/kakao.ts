"use server";

// AI classification for the KakaoTalk import page. Takes the parsed messages of
// one chat export, chunks them, and asks Gemini (per chunk) to sort real work
// into project groups matched against existing Project names. The client then
// commits each group through the existing `commitImport` pipeline.

import { prisma } from "@/server/db";
import { getScope } from "@/server/auth";
import { isAiAvailable, callGemini } from "@/server/import/ai";
import {
  chunkMessages,
  messagesToText,
  KAKAO_MAX_CHUNKS,
  type KakaoMessage,
  type KakaoGroup,
  type KakaoTaskDraft,
  type AnalyzeKakaoResult,
} from "@/lib/kakao";
import { TASK_STATUS_VALUES, TASK_PRIORITY_VALUES } from "@/lib/validation";

const UNASSIGNED = "미분류";

type RawGroup = {
  projectName?: unknown;
  summary?: unknown;
  tasks?: Array<Record<string, unknown>>;
  requirements?: Array<Record<string, unknown>>;
};

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

// ---- small coercers (mirror src/server/import/ai.ts) ----

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s || undefined;
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "");
}

function coerceStatus(v: unknown): KakaoTaskDraft["status"] {
  return (TASK_STATUS_VALUES as readonly string[]).includes(v as string)
    ? (v as KakaoTaskDraft["status"])
    : "TODO";
}

function coercePriority(v: unknown): KakaoTaskDraft["priority"] {
  return (TASK_PRIORITY_VALUES as readonly string[]).includes(v as string)
    ? (v as KakaoTaskDraft["priority"])
    : "MEDIUM";
}

function toISODate(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const m = v.trim().match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : undefined;
}

// Fold one chunk's group into the running accumulator, deduping tasks by title
// and requirements by name (normalized).
function mergeGroup(
  g: RawGroup,
  byKey: Map<string, KakaoGroup>,
  taskSeen: Map<string, Set<string>>,
  reqSeen: Map<string, Set<string>>,
) {
  const name = str(g.projectName) || UNASSIGNED;
  const key = norm(name);
  let group = byKey.get(key);
  if (!group) {
    group = { projectName: name, projectId: null, summary: "", tasks: [], requirements: [] };
    byKey.set(key, group);
    taskSeen.set(key, new Set());
    reqSeen.set(key, new Set());
  }
  const ts = taskSeen.get(key)!;
  const rs = reqSeen.get(key)!;

  const summary = str(g.summary);
  if (summary) group.summary = group.summary ? `${group.summary}\n${summary}` : summary;

  for (const t of g.tasks ?? []) {
    const title = str(t.title);
    if (!title) continue;
    const k = norm(title);
    if (ts.has(k)) continue;
    ts.add(k);
    group.tasks.push({
      title,
      status: coerceStatus(t.status),
      priority: coercePriority(t.priority),
      description: str(t.description),
    });
  }

  for (const r of g.requirements ?? []) {
    const rname = str(r.name);
    if (!rname) continue;
    const k = norm(rname);
    if (rs.has(k)) continue;
    rs.add(k);
    group.requirements.push({
      name: rname,
      category: str(r.category),
      detail: str(r.detail),
      acceptance: str(r.acceptance),
      requestDate: toISODate(r.requestDate),
      dueDate: toISODate(r.dueDate),
      targetDate: toISODate(r.targetDate),
    });
  }
}

// Match an AI-emitted project name to an existing project id (exact normalized,
// then containment either way). "미분류" and no-match stay null.
function matchProject(
  name: string,
  projects: { id: string; name: string }[],
): string | null {
  if (name === UNASSIGNED) return null;
  const n = norm(name);
  const exact = projects.find((p) => norm(p.name) === n);
  if (exact) return exact.id;
  // Fall back to containment, but only auto-assign when exactly one project
  // matches — an ambiguous match is left null for the user to resolve.
  const partials = projects.filter((p) => {
    const pn = norm(p.name);
    return pn.length >= 2 && (n.includes(pn) || pn.includes(n));
  });
  return partials.length === 1 ? partials[0].id : null;
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

  const byKey = new Map<string, KakaoGroup>();
  const taskSeen = new Map<string, Set<string>>();
  const reqSeen = new Map<string, Set<string>>();
  let partialFailures = 0;

  // Sequential: Gemini free/low tiers 429 easily and 60s-per-call parallelism
  // wouldn't shorten wall-clock meaningfully. One failed chunk is skipped.
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
    const groups = (raw as { groups?: RawGroup[] })?.groups ?? [];
    for (const g of groups) mergeGroup(g, byKey, taskSeen, reqSeen);
  }

  const groups = [...byKey.values()];
  for (const g of groups) g.projectId = matchProject(g.projectName, projects);

  // Matched projects first, 미분류 last; within each, richer groups first.
  groups.sort((a, b) => {
    const au = a.projectName === UNASSIGNED ? 1 : 0;
    const bu = b.projectName === UNASSIGNED ? 1 : 0;
    if (au !== bu) return au - bu;
    return (
      b.tasks.length + b.requirements.length - (a.tasks.length + a.requirements.length)
    );
  });

  if (!groups.length && partialFailures === chunks.length) {
    return { ok: false, error: "AI 분석에 모두 실패했습니다. 잠시 후 다시 시도하세요." };
  }

  return { ok: true, groups, partialFailures, truncated };
}

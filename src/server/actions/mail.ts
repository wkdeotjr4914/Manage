"use server";

// 수집 메일(CollectedMail) 액션 — 상태/메모 변경 및 노트로 변환.
// 메일은 개인 데이터라 모든 쿼리를 requireUser + 자기 userId로 스코프(IDOR 차단).
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUser, getScope } from "@/server/auth";
import { analyzeImport, commitImport } from "@/server/actions/import";
import { isAiAvailable, callGemini } from "@/server/import/ai";
import { TASK_STATUS_VALUES, TASK_PRIORITY_VALUES } from "@/lib/validation";
import { parseDateInput, todayDateInput } from "@/lib/utils";
import {
  normalizeMailTasks,
  type AnalyzeMailTasksResult,
  type SendAgentResult,
  type PollAgentResult,
} from "@/lib/mailTasks";
import {
  isAgentAvailable,
  agentChannelId,
  postAgentMessage,
  fetchMessagesAfter,
  extractJson,
  cmpId,
  type AgentMessage,
} from "@/server/agent/discord";
import type { ActionResult } from "./notes";

const statusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["NEW", "READ", "ARCHIVED"]),
});

export async function setCollectedMailStatus(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  // updateMany + userId 필터: 남의 메일 id를 넣어도 count 0으로 무해하게 실패.
  const res = await prisma.collectedMail.updateMany({
    where: { id: parsed.data.id, userId: user.id },
    data: { status: parsed.data.status },
  });
  if (res.count === 0) return { ok: false, error: "메일을 찾을 수 없습니다." };
  revalidatePath("/mails");
  return { ok: true };
}

const memoSchema = z.object({ id: z.string().min(1), memo: z.string().max(2000) });

export async function setCollectedMailMemo(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = memoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  const res = await prisma.collectedMail.updateMany({
    where: { id: parsed.data.id, userId: user.id },
    data: { memo: parsed.data.memo.trim() || null },
  });
  if (res.count === 0) return { ok: false, error: "메일을 찾을 수 없습니다." };
  revalidatePath("/mails");
  return { ok: true };
}

const convertSchema = z.object({ id: z.string().min(1) });

/** 수집 메일 1건을 기존 import 파이프라인으로 노트화(sourceKey로 멱등). */
export async function convertMailToNote(
  input: unknown,
): Promise<ActionResult<{ noteId: string | null }>> {
  const user = await requireUser();
  const parsed = convertSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  const mail = await prisma.collectedMail.findFirst({
    where: { id: parsed.data.id, userId: user.id },
  });
  if (!mail) return { ok: false, error: "메일을 찾을 수 없습니다." };

  const dateStr = mail.internalDate ? mail.internalDate.toISOString().slice(0, 10) : "";
  const markdown =
    `# ${mail.subject}\n\n` +
    `- 보낸사람: ${mail.fromAddr}\n` +
    (mail.toAddr ? `- 받는사람: ${mail.toAddr}\n` : "") +
    (dateStr ? `- 날짜: ${dateStr}\n` : "") +
    `\n---\n\n${mail.body || mail.snippet || ""}`;

  const analysis = await analyzeImport({
    markdown,
    filename: mail.subject,
    mode: "heuristic",
  });
  if (!analysis.ok) return { ok: false, error: analysis.error };

  const commit = await commitImport({
    plan: analysis.plan,
    sourceKey: `gmail:${mail.messageId}`,
    source: "MAIL",
    projectId: mail.projectId ?? undefined,
    skipTasks: !mail.projectId,
  });
  if (!commit.ok) return { ok: false, error: commit.error };

  const noteId = commit.data.firstNoteId;
  await prisma.collectedMail.update({
    where: { id: mail.id },
    data: { noteId, status: mail.status === "NEW" ? "READ" : mail.status },
  });
  revalidatePath("/mails");
  revalidatePath("/notes");
  return { ok: true, data: { noteId } };
}

// ---------------------------------------------------------------------------
// 메일 1건 → AI 업무 등록
// 카카오 가져오기(actions/kakao.ts)와 동일하게 callGemini로 본문을 업무로 분해하고,
// 사용자가 프로젝트를 고른 뒤 확인·선택한 업무만 칸반 Task + PMS 업무(PmsTask)로 저장한다.
// ---------------------------------------------------------------------------

// Gemini 구조화 출력 스키마(타입은 v1beta 규약상 UPPER-CASE — src/server/import/ai.ts 참고).
const MAIL_TASKS_SCHEMA = {
  type: "OBJECT",
  properties: {
    tasks: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          description: { type: "STRING" },
          status: { type: "STRING", enum: [...TASK_STATUS_VALUES] },
          priority: { type: "STRING", enum: [...TASK_PRIORITY_VALUES] },
          dueDate: { type: "STRING", description: "YYYY-MM-DD" },
        },
        required: ["title"],
      },
    },
  },
  required: ["tasks"],
};

function mailTaskSystemPrompt(projectName: string): string {
  return `당신은 이메일 한 통을 분석해 '${projectName}' 프로젝트의 실행 업무로 분해하는 PM 어시스턴트입니다.
주어진 메일 본문에서 실제 '할 일/요청/액션'을 찾아 업무 단위로 나눠 JSON으로 반환하세요.

규칙:
- 메일 하나에 여러 건의 요청·할 일이 섞여 있을 수 있으니 의미 있는 업무 단위로 나누세요.
- 인사말·서명·자동 문구·잡담·단순 정보 공유는 제외하고, 실제 액션이 필요한 것만 추출합니다.
- 각 업무:
  - title: 한 줄로 명확하게(한국어). 필수.
  - description: 메일에 근거한 내용을 1~3줄로 간략히. 불필요하면 비워도 됩니다.
  - status: 대개 TODO(이미 완료된 내용이면 DONE).
  - priority: LOW/MEDIUM/HIGH/URGENT 중 하나.
  - dueDate: 마감/기한이 명시된 경우에만 YYYY-MM-DD, 없으면 비웁니다.
- 근거가 없는 값은 지어내지 말고, 추출할 업무가 전혀 없으면 tasks를 빈 배열로 반환하세요.`;
}

const analyzeTasksSchema = z.object({
  mailId: z.string().min(1),
  projectId: z.string().min(1),
});

/** 메일 본문을 AI로 분석해 '{project}' 기준 업무 초안 배열을 돌려준다(저장하지 않음). */
export async function analyzeMailTasks(
  input: unknown,
): Promise<AnalyzeMailTasksResult> {
  const user = await requireUser();
  if (!isAiAvailable()) {
    return { ok: false, error: "AI 업무 분석에는 GEMINI_API_KEY가 필요합니다." };
  }
  const parsed = analyzeTasksSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  const mail = await prisma.collectedMail.findFirst({
    where: { id: parsed.data.mailId, userId: user.id },
  });
  if (!mail) return { ok: false, error: "메일을 찾을 수 없습니다." };

  const scope = await getScope();
  const project = await prisma.project.findFirst({
    where: { id: parsed.data.projectId, ...scope.where },
    select: { id: true, name: true },
  });
  if (!project) return { ok: false, error: "프로젝트를 찾을 수 없습니다." };

  const dateStr = mail.internalDate ? mail.internalDate.toISOString().slice(0, 10) : "";
  // 매우 긴 메일은 Gemini 입력 한도를 넘겨 MAX_TOKENS 오류가 나므로 본문을 제한.
  const bodyText = (mail.body || mail.snippet || "").slice(0, 40000);
  const mailText =
    `제목: ${mail.subject}\n` +
    `보낸사람: ${mail.fromAddr}\n` +
    (mail.toAddr ? `받는사람: ${mail.toAddr}\n` : "") +
    (dateStr ? `날짜: ${dateStr}\n` : "") +
    `\n---\n\n${bodyText}`;

  let raw: unknown;
  try {
    raw = await callGemini(
      [
        {
          text: `다음 이메일을 분석해 '${project.name}' 프로젝트의 실행 업무로 분해하세요.\n\n<email>\n${mailText}\n</email>`,
        },
      ],
      {
        system: mailTaskSystemPrompt(project.name),
        schema: MAIL_TASKS_SCHEMA,
        maxOutputTokens: 8192,
      },
    );
  } catch (e) {
    console.error("[actions/mail] 업무 분석 실패:", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "AI 분석에 실패했습니다.",
    };
  }

  // 제목 기준 중복 제거하며 초안으로 정규화(에이전트 경로와 공유).
  const tasks = normalizeMailTasks((raw as { tasks?: unknown })?.tasks);
  return { ok: true, tasks };
}

const taskDraftSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(2000).optional(),
  status: z.enum(TASK_STATUS_VALUES),
  priority: z.enum(TASK_PRIORITY_VALUES),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const registerTasksSchema = z.object({
  mailId: z.string().min(1),
  projectId: z.string().min(1),
  tasks: z.array(taskDraftSchema).min(1, "등록할 업무를 선택하세요.").max(50),
});

/** 선택된 업무 초안을 프로젝트의 칸반 Task + PMS 업무(PmsTask)로 저장한다. */
export async function registerMailTasks(
  input: unknown,
): Promise<ActionResult<{ taskCount: number; pmsTaskCount: number }>> {
  const user = await requireUser();
  const parsed = registerTasksSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  const { mailId, projectId, tasks } = parsed.data;

  const mail = await prisma.collectedMail.findFirst({
    where: { id: mailId, userId: user.id },
    select: { id: true, status: true },
  });
  if (!mail) return { ok: false, error: "메일을 찾을 수 없습니다." };

  const scope = await getScope();
  const project = await prisma.project.findFirst({
    where: { id: projectId, ...scope.where },
    select: { id: true },
  });
  if (!project) return { ok: false, error: "프로젝트를 찾을 수 없습니다." };

  // 제목 정규화(대소문자·공백 무시) — 재등록 시 사소한 표기 차이로 중복 생성되는 걸 막음.
  const normTitle = (s: string) => s.toLowerCase().replace(/\s+/g, "");

  // 칸반 Task 생성 — 이미 있는 제목은 건너뛰고, order는 status 열의 현재 최대값 뒤에 이어붙인다
  // (진행 중인 보드 중간에 끼어들지 않도록; import.ts:246-269 패턴을 보정).
  const existingTasks = await prisma.task.findMany({
    where: { projectId },
    select: { title: true, status: true, order: true },
  });
  const seenTitles = new Set(existingTasks.map((t) => normTitle(t.title)));
  const orderByStatus: Record<string, number> = {};
  for (const t of existingTasks) {
    orderByStatus[t.status] = Math.max(orderByStatus[t.status] ?? 0, t.order);
  }
  let taskCount = 0;
  for (const t of tasks) {
    const key = normTitle(t.title);
    if (seenTitles.has(key)) continue;
    seenTitles.add(key);
    orderByStatus[t.status] = (orderByStatus[t.status] ?? 0) + 1000;
    await prisma.task.create({
      data: {
        projectId,
        title: t.title,
        description: t.description || null,
        status: t.status,
        priority: t.priority,
        order: orderByStatus[t.status],
        dueDate: parseDateInput(t.dueDate),
        source: "MAIL",
      },
    });
    taskCount++;
  }

  // 같은 업무를 PMS 업무(PmsTask) 서브메뉴에도 저장 — 이름 dedup, sortOrder 부여
  // (import.ts:410-439 패턴). dueDate는 endDate로 매핑.
  const existingPms = await prisma.pmsTask.findMany({
    where: { projectId },
    select: { name: true, sortOrder: true },
    orderBy: { sortOrder: "desc" },
  });
  const seenNames = new Set(existingPms.map((r) => normTitle(r.name)));
  let order = existingPms[0]?.sortOrder ?? 0;
  let pmsTaskCount = 0;
  for (const t of tasks) {
    const key = normTitle(t.title);
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    order += 1000;
    await prisma.pmsTask.create({
      data: {
        projectId,
        sortOrder: order,
        name: t.title,
        priority: t.priority,
        status: t.status,
        // 시작일은 데이터 쌓은 시점(오늘)을 디폴트로, 종료일은 메일에서 뽑은 마감일.
        startDate: parseDateInput(todayDateInput()),
        endDate: parseDateInput(t.dueDate),
        source: "MAIL",
      },
    });
    pmsTaskCount++;
  }

  // 메일에 연결 프로젝트를 기억하고, 신규면 확인(READ)으로.
  await prisma.collectedMail.update({
    where: { id: mail.id },
    data: {
      projectId,
      status: mail.status === "NEW" ? "READ" : mail.status,
    },
  });

  revalidatePath("/mails");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/tasks`);
  revalidatePath("/");
  return { ok: true, data: { taskCount, pmsTaskCount } };
}

// ---------------------------------------------------------------------------
// 메일 1건 → 에이전트(Hermes) 업무 분해 — Discord 경유 비동기.
// Gemini(analyzeMailTasks)와 나란히 두 번째 엔진으로 쓴다. 왕복이 길어(~4.5분)
// "전송(send) → 폴링(poll)"의 짧은 두 액션으로 나눠 서버 함수 타임아웃을 피한다.
// ---------------------------------------------------------------------------

// Discord 메시지 1건(2000자) 안에 담을 통합 프롬프트. Gemini의 systemInstruction이
// 없으므로 시스템 지시 + "순수 JSON만" 요구 + 스키마 예시 + 메일 본문을 하나로 합친다.
const AGENT_JSON_INSTRUCTION = `

★ 출력은 아래 형태의 "순수 JSON"만. 코드펜스나 설명 문장을 붙이지 마세요.
{"tasks":[{"title":"...","description":"...","status":"TODO","priority":"MEDIUM","dueDate":"2026-07-20"}]}`;

function buildAgentMailPrompt(
  projectName: string,
  mailText: string,
):
  | { ok: true; prompt: string; truncated: boolean }
  | { ok: false; error: string } {
  const LIMIT = 2000; // Discord 메시지 최대 길이
  const head = `${mailTaskSystemPrompt(projectName)}${AGENT_JSON_INSTRUCTION}\n\n<email>\n`;
  const tail = `\n</email>`;
  const budget = LIMIT - head.length - tail.length;
  if (budget < 200) {
    return { ok: false, error: "프롬프트 고정 문구가 Discord 2000자 한도에 너무 근접합니다." };
  }
  let body = mailText;
  let truncated = false;
  if (body.length > budget) {
    body = body.slice(0, budget - 1);
    // surrogate pair가 중간에 잘렸으면(하이 서로게이트로 끝나면) 반쪽 한 단위를 버린다.
    if (/[\uD800-\uDBFF]$/.test(body)) body = body.slice(0, -1);
    body += "…";
    truncated = true;
  }
  return { ok: true, prompt: `${head}${body}${tail}`, truncated };
}

/** 메일→업무 프롬프트를 에이전트(Discord) 채널로 전송. 폴링 커서(afterId)를 돌려준다. */
export async function sendMailTasksViaAgent(input: unknown): Promise<SendAgentResult> {
  const user = await requireUser();
  if (!isAgentAvailable()) {
    return { ok: false, error: "에이전트 연동(DISCORD_BOT_TOKEN·채널)이 설정되지 않았습니다." };
  }
  const parsed = analyzeTasksSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  const mail = await prisma.collectedMail.findFirst({
    where: { id: parsed.data.mailId, userId: user.id },
  });
  if (!mail) return { ok: false, error: "메일을 찾을 수 없습니다." };

  const scope = await getScope();
  const project = await prisma.project.findFirst({
    where: { id: parsed.data.projectId, ...scope.where },
    select: { id: true, name: true },
  });
  if (!project) return { ok: false, error: "프로젝트를 찾을 수 없습니다." };

  const dateStr = mail.internalDate ? mail.internalDate.toISOString().slice(0, 10) : "";
  const mailText =
    `제목: ${mail.subject}\n` +
    `보낸사람: ${mail.fromAddr}\n` +
    (mail.toAddr ? `받는사람: ${mail.toAddr}\n` : "") +
    (dateStr ? `날짜: ${dateStr}\n` : "") +
    `\n---\n\n${mail.body || mail.snippet || ""}`;

  const built = buildAgentMailPrompt(project.name, mailText);
  if (!built.ok) return { ok: false, error: built.error };

  try {
    const { messageId } = await postAgentMessage(built.prompt);
    return { ok: true, afterId: messageId, truncated: built.truncated };
  } catch (e) {
    console.error("[actions/mail] 에이전트 전송 실패:", e);
    return { ok: false, error: e instanceof Error ? e.message : "에이전트 전송에 실패했습니다." };
  }
}

const pollAgentSchema = z.object({
  afterId: z.string().min(1),
});

/** 에이전트 채널을 1회 폴링. JSON 답장이 오면 업무 초안을, 아니면 pending을 반환.
 *  채널은 클라이언트 입력이 아니라 서버의 agentChannelId()로 고정한다(임의 채널 조회 차단). */
export async function pollMailTasksViaAgent(input: unknown): Promise<PollAgentResult> {
  await requireUser();
  const channelId = agentChannelId();
  if (!channelId) {
    return { ok: false, error: "에이전트 연동이 설정되지 않았습니다." };
  }
  const parsed = pollAgentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }

  let cursor = parsed.data.afterId;
  let messages: AgentMessage[] = [];
  try {
    messages = await fetchMessagesAfter(channelId, cursor);
  } catch (e) {
    console.error("[actions/mail] 에이전트 폴링 실패:", e);
    return { ok: false, error: e instanceof Error ? e.message : "에이전트 응답 조회에 실패했습니다." };
  }

  for (const m of messages) {
    if (cmpId(m.id, cursor) > 0) cursor = m.id; // 커서 전진
    if (!m.content) continue;
    const json = extractJson(m.content);
    // 상태배너·"🐍 Running code…" 등 비-JSON 또는 tasks 없는 메시지는 건너뛴다.
    if (!json || !Array.isArray((json as { tasks?: unknown }).tasks)) continue;
    const tasks = normalizeMailTasks((json as { tasks?: unknown }).tasks);
    return { ok: true, status: "done", tasks, cursor };
  }
  return { ok: true, status: "pending", cursor };
}

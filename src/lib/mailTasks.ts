// 수집 메일 1건 → AI 업무 분해의 공유 타입/헬퍼. 서버 액션(analyzeMailTasks)과
// 클라이언트(MailTaskDialog)가 함께 쓰므로 `server-only`가 아니며 서버 의존성이 없다.
// (lib/kakao.ts와 같은 위치 규약)

import { TASK_STATUS_VALUES, TASK_PRIORITY_VALUES } from "@/lib/validation";
import type { TaskStatusKey, TaskPriorityKey } from "@/lib/theme";

// AI가 메일에서 뽑아낸 업무 1건의 초안(미리보기·등록 대상).
export type MailTaskDraft = {
  title: string;
  description?: string;
  status: TaskStatusKey;
  priority: TaskPriorityKey;
  dueDate?: string; // "YYYY-MM-DD"
};

// analyzeMailTasks 서버 액션의 반환 형태(양쪽이 공유).
export type AnalyzeMailTasksResult =
  | { ok: true; tasks: MailTaskDraft[] }
  | { ok: false; error: string };

// ---- 순수 coercer (src/lib/kakao.ts / src/server/import/ai.ts 미러) ----

export function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s || undefined;
}

export function coerceStatus(v: unknown): TaskStatusKey {
  return (TASK_STATUS_VALUES as readonly string[]).includes(v as string)
    ? (v as TaskStatusKey)
    : "TODO";
}

export function coercePriority(v: unknown): TaskPriorityKey {
  return (TASK_PRIORITY_VALUES as readonly string[]).includes(v as string)
    ? (v as TaskPriorityKey)
    : "MEDIUM";
}

export function toISODate(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const m = v.trim().match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : undefined;
}

// AI(Gemini/에이전트)가 돌려준 raw tasks 배열 → 제목 dedup·정규화한 초안 배열.
// analyzeMailTasks(Gemini)와 analyzeMailTasksViaHermes(프록시) 경로가 공유한다.
export function normalizeMailTasks(rawTasks: unknown): MailTaskDraft[] {
  const arr = Array.isArray(rawTasks) ? rawTasks : [];
  const seen = new Set<string>();
  const out: MailTaskDraft[] = [];
  for (const t of arr) {
    const rec = (t ?? {}) as Record<string, unknown>;
    const title = str(rec.title);
    if (!title) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      title,
      description: str(rec.description),
      status: coerceStatus(rec.status),
      priority: coercePriority(rec.priority),
      dueDate: toISODate(rec.dueDate),
    });
  }
  return out;
}

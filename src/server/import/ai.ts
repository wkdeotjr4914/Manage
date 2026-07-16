import "server-only";
import type {
  ImportPlan,
  PlanNote,
  PlanEdge,
  PlanTask,
  PlanRequirement,
  PlanRequirementSpec,
  PlanWbsItem,
  PlanPmsTask,
  PlanDeliverable,
} from "@/lib/import";
import {
  NODE_TYPE_VALUES,
  EDGE_TYPE_VALUES,
  TASK_STATUS_VALUES,
  TASK_PRIORITY_VALUES,
  IMPORTANCE_VALUES,
} from "@/lib/validation";
import type {
  NodeTypeKey,
  EdgeTypeKey,
  TaskStatusKey,
  TaskPriorityKey,
  ImportanceKey,
} from "@/lib/theme";
import { extractMetadata, type ExtractedMetadata } from "./metadata";

export function isAiAvailable() {
  return Boolean(process.env.GEMINI_API_KEY);
}

const SYSTEM = `당신은 회의록·업무 문서를 "세컨드 브레인" 지식 그래프로 구조화하는 도우미입니다.
주어진 마크다운을 분석해 아래 스키마의 JSON으로 다음을 반환하세요.

- notes: 문서를 의미 단위로 쪼갠 지식 노드들.
  - 문서 전체를 담는 원본 노트 1개는 반드시 type=EPISODIC, key="doc" 로 만들고 content 에 원문을 넣습니다.
  - 핵심 결정/개념/절차는 각각 별도 노트로 만들고 적절한 type 을 고릅니다.
    (SEMANTIC=개념·사실, PROCEDURAL=절차·방법, THESIS=핵심 주장·결정, REFLECTIVE=의견·통찰, EPISODIC=사건·회의, ENTITY=사람·조직·제품)
  - summary 는 한 줄 요약, content 는 마크다운. tags 는 짧은 키워드 배열.
- edges: 노트 사이 관계. sourceKey/targetKey 는 notes 의 key 를 참조.
  (SUPPORTS=뒷받침, EXTENDS=확장, INSTANTIATES=구체화, CONTRADICTS=반박, REFINES=정교화, COMPOSES=구성, MENTIONS=언급, REQUIRES=선행)
  원본 노트(doc)가 각 핵심 노트를 MENTIONS 로 가리키게 하고, 개념 간 관계도 최대한 연결하세요.
- tasks: 문서의 '할 일/액션/후속조치'에서 뽑은 실행 항목. status 는 대개 TODO, 이미 끝난 건 DONE.
- topicName: 문서 전체를 아우르는 토픽 이름 1개.

또한 문서가 프로젝트 관리(PMS) 성격의 내용을 담고 있으면 아래 항목도 채우세요.
문서에 근거가 없는 항목은 비워 두고(빈 배열), 값을 지어내지 마세요.
- requirements: '요구사항 정의/과업 요구사항' 항목. name 은 필수. category(기능/비기능 등), classif, detail,
  acceptance(수용/부분수용/불수용/협의), output(산출물), 그리고 날짜가 있으면 requestDate/dueDate/targetDate.
- requirementSpecs: '요구사항 명세서' 항목(더 상세한 기능 명세). name 필수. systemType(관리자/사용자/공통),
  menuPath(메뉴 경로), detail, importance(LOW/MEDIUM/HIGH), requester, requestDate/dueDate/targetDate, progress(0~100).
- wbsItems: '작업 분해/WBS/일정' 항목. key(참조용 임시 id)와 name 필수. 상위-하위가 있으면 parentKey 로 연결.
  code, phase(단계), assignee(담당), status, priority, progress, startDate/endDate.
- pmsTasks: 일정이 있는 실행 업무(담당·기간 중심). name 필수. code, phase, assignee, status, priority, progress, startDate/endDate.
- deliverables: '산출물/납품물' 항목. name 필수, description.

★ 모든 날짜는 반드시 YYYY-MM-DD 형식의 문자열로 쓰세요(예: 2026-07-13). 연도가 없으면 비워 두세요.

한국어 문서면 한국어로 작성하세요. 과도하게 잘게 쪼개지 말고 핵심 위주로 8~16개 노트가 적당합니다.`;

// Gemini `responseSchema` (OpenAPI subset). Types are UPPER-CASE per the
// generativelanguage v1beta REST contract. Mirrors the structured output the
// import pipeline expects; `coercePlan` is the final validation backstop, so
// this schema can stay loose.
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    documentTitle: { type: "STRING" },
    topicName: { type: "STRING" },
    notes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          key: { type: "STRING" },
          title: { type: "STRING" },
          type: { type: "STRING", enum: [...NODE_TYPE_VALUES] },
          summary: { type: "STRING" },
          content: { type: "STRING" },
          tags: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["key", "title", "type", "content"],
      },
    },
    edges: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          sourceKey: { type: "STRING" },
          targetKey: { type: "STRING" },
          type: { type: "STRING", enum: [...EDGE_TYPE_VALUES] },
        },
        required: ["sourceKey", "targetKey", "type"],
      },
    },
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
          classif: { type: "STRING" },
          detail: { type: "STRING" },
          acceptance: { type: "STRING" },
          output: { type: "STRING" },
          requestDate: { type: "STRING", description: "YYYY-MM-DD" },
          dueDate: { type: "STRING", description: "YYYY-MM-DD" },
          targetDate: { type: "STRING", description: "YYYY-MM-DD" },
        },
        required: ["name"],
      },
    },
    requirementSpecs: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          systemType: { type: "STRING" },
          menuPath: { type: "STRING" },
          detail: { type: "STRING" },
          importance: { type: "STRING", enum: [...IMPORTANCE_VALUES] },
          requester: { type: "STRING" },
          requestDate: { type: "STRING", description: "YYYY-MM-DD" },
          dueDate: { type: "STRING", description: "YYYY-MM-DD" },
          targetDate: { type: "STRING", description: "YYYY-MM-DD" },
          progress: { type: "INTEGER" },
        },
        required: ["name"],
      },
    },
    wbsItems: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          key: { type: "STRING" },
          parentKey: { type: "STRING" },
          name: { type: "STRING" },
          code: { type: "STRING" },
          phase: { type: "STRING" },
          assignee: { type: "STRING" },
          status: { type: "STRING", enum: [...TASK_STATUS_VALUES] },
          priority: { type: "STRING", enum: [...TASK_PRIORITY_VALUES] },
          progress: { type: "INTEGER" },
          startDate: { type: "STRING", description: "YYYY-MM-DD" },
          endDate: { type: "STRING", description: "YYYY-MM-DD" },
        },
        required: ["key", "name"],
      },
    },
    pmsTasks: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          code: { type: "STRING" },
          phase: { type: "STRING" },
          assignee: { type: "STRING" },
          status: { type: "STRING", enum: [...TASK_STATUS_VALUES] },
          priority: { type: "STRING", enum: [...TASK_PRIORITY_VALUES] },
          progress: { type: "INTEGER" },
          startDate: { type: "STRING", description: "YYYY-MM-DD" },
          endDate: { type: "STRING", description: "YYYY-MM-DD" },
        },
        required: ["name"],
      },
    },
    deliverables: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          description: { type: "STRING" },
        },
        required: ["name"],
      },
    },
  },
  required: ["documentTitle", "notes", "edges", "tasks"],
};

type RawPlan = {
  documentTitle?: string;
  topicName?: string;
  notes?: Array<Partial<PlanNote>>;
  edges?: Array<Partial<PlanEdge>>;
  tasks?: Array<Partial<PlanTask>>;
  requirements?: Array<Record<string, unknown>>;
  requirementSpecs?: Array<Record<string, unknown>>;
  wbsItems?: Array<Record<string, unknown>>;
  pmsTasks?: Array<Record<string, unknown>>;
  deliverables?: Array<Record<string, unknown>>;
};

/** Normalize any of `YYYY-MM-DD` / `YYYY.MM.DD` / `YYYY/MM/DD` → `YYYY-MM-DD`. */
function toISODate(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const m = v.trim().match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (!m) return undefined;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s || undefined;
}

function toInt(v: unknown, min = 0, max = 100): number | undefined {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function toStatus(v: unknown): TaskStatusKey | undefined {
  return TASK_STATUS_VALUES.includes(v as TaskStatusKey)
    ? (v as TaskStatusKey)
    : undefined;
}

function toPriority(v: unknown): TaskPriorityKey | undefined {
  return TASK_PRIORITY_VALUES.includes(v as TaskPriorityKey)
    ? (v as TaskPriorityKey)
    : undefined;
}

function toImportance(v: unknown): ImportanceKey | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (s === "상") return "HIGH";
  if (s === "중") return "MEDIUM";
  if (s === "하") return "LOW";
  const up = s.toUpperCase();
  return IMPORTANCE_VALUES.includes(up as ImportanceKey)
    ? (up as ImportanceKey)
    : undefined;
}

/** Coerce the optional PMS arrays. Only `name`/`key` are required per item. */
function coercePms(raw: RawPlan) {
  const requirements: PlanRequirement[] = (raw.requirements ?? [])
    .filter((r) => str(r.name))
    .map((r) => ({
      name: str(r.name)!,
      category: str(r.category),
      classif: str(r.classif),
      detail: str(r.detail),
      acceptance: str(r.acceptance),
      output: str(r.output),
      requestDate: toISODate(r.requestDate),
      dueDate: toISODate(r.dueDate),
      targetDate: toISODate(r.targetDate),
    }));

  const requirementSpecs: PlanRequirementSpec[] = (raw.requirementSpecs ?? [])
    .filter((r) => str(r.name))
    .map((r) => ({
      name: str(r.name)!,
      systemType: str(r.systemType),
      menuPath: str(r.menuPath),
      detail: str(r.detail),
      importance: toImportance(r.importance),
      requester: str(r.requester),
      requestDate: toISODate(r.requestDate),
      dueDate: toISODate(r.dueDate),
      targetDate: toISODate(r.targetDate),
      progress: toInt(r.progress),
    }));

  const rawWbs = (raw.wbsItems ?? []).filter((w) => str(w.key) && str(w.name));
  const wbsKeys = new Set(rawWbs.map((w) => str(w.key)!));
  const wbsItems: PlanWbsItem[] = rawWbs.map((w) => {
    const parentKey = str(w.parentKey);
    return {
      key: str(w.key)!,
      parentKey: parentKey && wbsKeys.has(parentKey) ? parentKey : undefined,
      name: str(w.name)!,
      code: str(w.code),
      phase: str(w.phase),
      assignee: str(w.assignee),
      status: toStatus(w.status),
      priority: toPriority(w.priority),
      progress: toInt(w.progress),
      startDate: toISODate(w.startDate),
      endDate: toISODate(w.endDate),
    };
  });

  const pmsTasks: PlanPmsTask[] = (raw.pmsTasks ?? [])
    .filter((t) => str(t.name))
    .map((t) => ({
      name: str(t.name)!,
      code: str(t.code),
      phase: str(t.phase),
      assignee: str(t.assignee),
      status: toStatus(t.status),
      priority: toPriority(t.priority),
      progress: toInt(t.progress),
      startDate: toISODate(t.startDate),
      endDate: toISODate(t.endDate),
    }));

  const deliverables: PlanDeliverable[] = (raw.deliverables ?? [])
    .filter((d) => str(d.name))
    .map((d) => ({ name: str(d.name)!, description: str(d.description) }));

  return { requirements, requirementSpecs, wbsItems, pmsTasks, deliverables };
}

function coercePlan(raw: RawPlan, fallbackTitle: string): ImportPlan {
  const notes: PlanNote[] = (raw.notes ?? [])
    .filter((n) => n.key && n.title && n.content)
    .map((n) => ({
      key: String(n.key),
      title: String(n.title),
      type: (NODE_TYPE_VALUES.includes(n.type as NodeTypeKey)
        ? n.type
        : "SEMANTIC") as NodeTypeKey,
      summary: n.summary ? String(n.summary) : undefined,
      content: String(n.content),
      tags: Array.isArray(n.tags) ? n.tags.map(String) : [],
    }));

  const keys = new Set(notes.map((n) => n.key));
  const edges: PlanEdge[] = (raw.edges ?? [])
    .filter(
      (e) =>
        e.sourceKey &&
        e.targetKey &&
        e.sourceKey !== e.targetKey &&
        keys.has(String(e.sourceKey)) &&
        keys.has(String(e.targetKey)) &&
        EDGE_TYPE_VALUES.includes(e.type as EdgeTypeKey),
    )
    .map((e) => ({
      sourceKey: String(e.sourceKey),
      targetKey: String(e.targetKey),
      type: e.type as EdgeTypeKey,
    }));

  const tasks: PlanTask[] = (raw.tasks ?? [])
    .filter((t) => t.title)
    .map((t) => ({
      title: String(t.title),
      status: (TASK_STATUS_VALUES.includes(t.status as TaskStatusKey)
        ? t.status
        : "TODO") as TaskStatusKey,
      priority: (TASK_PRIORITY_VALUES.includes(t.priority as TaskPriorityKey)
        ? t.priority
        : "MEDIUM") as TaskPriorityKey,
      description: t.description ? String(t.description) : undefined,
    }));

  return {
    documentTitle: raw.documentTitle ? String(raw.documentTitle) : fallbackTitle,
    topicName: raw.topicName ? String(raw.topicName) : undefined,
    notes,
    edges,
    tasks,
    ...coercePms(raw),
  };
}

/**
 * Fold explicit document metadata (frontmatter + hashtags) into the AI plan so
 * declared tags / topic / project always win over model inference.
 */
function mergeMetadata(plan: ImportPlan, meta: ExtractedMetadata): ImportPlan {
  const docNote = plan.notes.find((n) => n.key === "doc") ?? plan.notes[0];
  if (docNote && meta.tags.length) {
    const seen = new Set(docNote.tags.map((t) => t.toLowerCase()));
    for (const t of meta.tags) {
      if (!seen.has(t.toLowerCase())) {
        seen.add(t.toLowerCase());
        docNote.tags.push(t);
      }
    }
  }
  return {
    ...plan,
    documentTitle: meta.title || plan.documentTitle,
    topicName: meta.topic || plan.topicName,
    projectName: meta.project || plan.projectName,
  };
}

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

/**
 * Low-level Gemini call: POST `parts` as the user turn under a structured-output
 * schema and return the parsed JSON. Shared by the import pipeline (runGemini)
 * and the KakaoTalk classifier (analyzeKakaoChat). Surfaces clean, status-based
 * Korean errors; the caller validates/coerces the returned shape.
 */
export async function callGemini(
  parts: GeminiPart[],
  opts: {
    system: string;
    schema: object;
    maxOutputTokens?: number;
    temperature?: number;
    timeoutMs?: number;
  },
): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");
  // gemini-2.0-flash는 서비스 종료(retired)됨. flash-latest 별칭이 최신 Flash를 가리킨다.
  const model = process.env.IMPORT_AI_MODEL || "gemini-flash-lite-latest";

  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: opts.system }] },
          contents: [{ role: "user", parts }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: opts.schema,
            // Flash 계열은 thinking 모델이라 사고 토큰까지 이 한도를 공유한다.
            maxOutputTokens: opts.maxOutputTokens ?? 32768,
            temperature: opts.temperature ?? 0.2,
          },
        }),
      },
    );
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") {
      throw new Error("Gemini API 요청 시간이 초과됐습니다. 잠시 후 다시 시도하세요.");
    }
    throw new Error("Gemini API 연결에 실패했습니다.");
  }

  // Log the raw error server-side (may contain key/quota details) but surface a
  // clean, status-based Korean message to the user.
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[import/ai] Gemini API ${res.status}:`, body);
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      throw new Error("Gemini API 키가 유효하지 않거나 권한이 없습니다. GEMINI_API_KEY를 확인하세요.");
    }
    if (res.status === 429) {
      throw new Error("Gemini API 호출 한도를 초과했습니다. 잠시 후 다시 시도하세요.");
    }
    throw new Error(`Gemini API 오류(${res.status}). 잠시 후 다시 시도하세요.`);
  }

  const data = await res.json();
  const candidate = data?.candidates?.[0];
  if (candidate?.finishReason === "MAX_TOKENS") {
    throw new Error("문서가 너무 길어 AI가 끝까지 처리하지 못했습니다. 문서를 나눠서 시도해 보세요.");
  }
  const text: string | undefined = candidate?.content?.parts?.[0]?.text;
  if (!text) throw new Error("AI가 구조화 결과를 반환하지 않았습니다.");

  try {
    return JSON.parse(text);
  } catch {
    console.error("[import/ai] JSON 파싱 실패:", text.slice(0, 500));
    throw new Error("AI 응답을 JSON으로 해석하지 못했습니다.");
  }
}

/**
 * Shared Gemini call for the import pipeline: structure `parts` into an
 * ImportPlan. Backs both the text and PDF entry points.
 */
async function runGemini(
  parts: GeminiPart[],
  fallbackTitle: string,
): Promise<ImportPlan> {
  const raw = (await callGemini(parts, {
    system: SYSTEM,
    schema: RESPONSE_SCHEMA,
    maxOutputTokens: 32768,
    temperature: 0.2,
  })) as RawPlan;
  return coercePlan(raw, fallbackTitle);
}

/** Structure a markdown/text document; frontmatter + hashtags win over model inference. */
export async function analyzeAI(
  markdown: string,
  fallbackTitle: string,
): Promise<ImportPlan> {
  const meta = extractMetadata(markdown);
  const plan = await runGemini(
    [
      {
        text: `다음 문서를 구조화해 주세요.\n\n<document filename="${fallbackTitle.replace(/"/g, "'")}">\n${meta.body}\n</document>`,
      },
    ],
    fallbackTitle,
  );
  return mergeMetadata(plan, meta);
}

/**
 * Structure a PDF by handing the raw bytes to Gemini's multimodal input
 * (`inlineData`). No text extraction — Gemini reads layout/tables and OCRs
 * scanned pages. AI-mode only; there is no heuristic fallback for PDF.
 */
export async function analyzeAIFromPdf(
  base64: string,
  mimeType: string,
  fallbackTitle: string,
): Promise<ImportPlan> {
  return runGemini(
    [
      { text: `다음 PDF 문서를 구조화해 주세요. 파일명: ${fallbackTitle.replace(/"/g, "'")}` },
      { inlineData: { mimeType: mimeType || "application/pdf", data: base64 } },
    ],
    fallbackTitle,
  );
}

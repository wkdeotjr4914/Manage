// KakaoTalk chat export (.txt) → structured messages, for the /import/kakao page.
//
// Runs in the browser: the picked file is read with `file.text()`, parsed here
// into `KakaoMessage[]`, and the messages travel to the `analyzeKakaoChat`
// server action (which chunks them and asks Gemini to classify by project).
// This module is intentionally NOT `server-only` — it's shared by the client
// component and the server action, and pulls in no server deps.

import type {
  ImportPlan,
  PlanNote,
  PlanTask,
  PlanPmsTask,
  PlanRequirement,
} from "@/lib/import";
import { TASK_STATUS_VALUES, TASK_PRIORITY_VALUES } from "@/lib/validation";
import type { TaskStatusKey, TaskPriorityKey } from "@/lib/theme";

export type KakaoMessage = {
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:mm" (24h)
  speaker: string;
  text: string; // multi-line messages are joined with "\n"
};

export type KakaoParseResult = {
  roomName: string;
  participants: string[];
  messageCount: number;
  dateRange: { start: string; end: string } | null;
  messages: KakaoMessage[];
  droppedSystem: number; // invite/leave/join notices skipped
  droppedMedia: number; // "사진"/"이모티콘"/… placeholders skipped
};

// ---- shape the AI classifier returns, per detected project ----

export type KakaoTaskDraft = {
  title: string;
  status: TaskStatusKey;
  priority: TaskPriorityKey;
  description?: string;
};

export type KakaoRequirementDraft = {
  name: string;
  category?: string;
  detail?: string;
  acceptance?: string;
  requestDate?: string;
  dueDate?: string;
  targetDate?: string;
};

export type KakaoGroup = {
  projectName: string; // an existing Project.name, or "미분류"
  projectId: string | null; // resolved by the server (name match) or user-corrected
  summary: string;
  tasks: KakaoTaskDraft[];
  requirements: KakaoRequirementDraft[];
};

// The value the server action returns; defined here so both sides share it.
export type AnalyzeKakaoResult =
  | { ok: true; groups: KakaoGroup[]; partialFailures: number; truncated: boolean }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

// Android export: "2025년 1월 2일 오후 4:42, 발화자 : 내용"
const MSG_RE =
  /^(\d{4})년\s+(\d{1,2})월\s+(\d{1,2})일\s+(오전|오후)\s+(\d{1,2}):(\d{2}),\s+(.+?)\s+:\s(.*)$/;
// iOS export: "2025. 1. 2. 오후 4:42, 발화자 : 내용" (best-effort)
const IOS_MSG_RE =
  /^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s+(오전|오후)\s+(\d{1,2}):(\d{2}),?\s+(.+?)\s+:\s(.*)$/;

// A line that BEGINS with a timestamp (message OR system notice). Any such line
// ends the previous message — so an invite notice (which has no " : ") is never
// mistaken for a continuation line of the message above it. The comma is
// optional to also catch iOS notices without one.
const TS_PREFIX_RE =
  /^(?:\d{4}년\s+\d{1,2}월\s+\d{1,2}일|\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.)\s+(?:오전|오후)\s+\d{1,2}:\d{2},?/;

// Day/session header line (timestamp only, no comma, no content) → ignore.
const DATE_HEADER_RE =
  /^(?:\d{4}년\s+\d{1,2}월\s+\d{1,2}일|\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.)\s+(?:오전|오후)\s+\d{1,2}:\d{2}$/;

// Some exports use a divider line for each day: "--------------- 2025년 1월 2일
// 목요일 ---------------". Treat it like a session header (reset, never append).
const DIVIDER_RE = /^-{3,}.*\d{4}.*-{3,}$/;

// System notices (room membership changes) — dropped, only counted.
const SYSTEM_RE =
  /(님이 .*님을 초대했습니다|님이 나갔습니다|님이 들어왔습니다|채팅방 관리자가|님을 내보냈습니다|방장이 되었습니다)/;

// Media / non-text placeholders — dropped. Anchored so real messages that merely
// start with these words (e.g. "파일 좀 봐줘") are kept.
const MEDIA_RE =
  /^(사진|사진 \d+장|이모티콘|동영상|음성메시지|파일|보이스톡 해요|페이스톡 해요|삭제된 메시지입니다\.?)$/;

function to24h(ampm: string, h: number): number {
  if (ampm === "오전") return h === 12 ? 0 : h; // 오전 12시 = 00시
  return h === 12 ? 12 : h + 12; // 오후 12시 = 12시(정오)
}

function pad(n: string): string {
  return n.padStart(2, "0");
}

export function parseKakaoExport(raw: string): KakaoParseResult {
  // Sample exports carry a UTF-8 BOM and CRLF line endings — strip/normalize
  // first or the room-name match and every regex anchor misfire.
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");

  let roomName = "카카오톡 대화";
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const m = lines[i].match(/^(.*?)\s*님과 카카오톡 대화\s*$/);
    if (m) {
      roomName = m[1].trim() || roomName;
      break;
    }
  }

  const messages: KakaoMessage[] = [];
  const participants = new Set<string>();
  let droppedSystem = 0;
  let droppedMedia = 0;
  let last: KakaoMessage | null = null;

  for (const line of lines) {
    if (DATE_HEADER_RE.test(line) || DIVIDER_RE.test(line)) {
      last = null;
      continue;
    }

    if (TS_PREFIX_RE.test(line)) {
      last = null; // a fresh timestamped line always closes the previous message
      if (SYSTEM_RE.test(line)) {
        droppedSystem++;
        continue;
      }
      const m = MSG_RE.exec(line) ?? IOS_MSG_RE.exec(line);
      if (!m) {
        // timestamped notice without a "speaker : content" body
        droppedSystem++;
        continue;
      }
      const content = m[8].trim();
      if (!content) {
        droppedSystem++; // empty body — not media, just an empty send
        continue;
      }
      if (MEDIA_RE.test(content)) {
        droppedMedia++;
        continue;
      }
      const msg: KakaoMessage = {
        date: `${m[1]}-${pad(m[2])}-${pad(m[3])}`,
        time: `${String(to24h(m[4], parseInt(m[5], 10))).padStart(2, "0")}:${m[6]}`,
        speaker: m[7].trim(),
        text: content,
      };
      messages.push(msg);
      participants.add(msg.speaker);
      last = msg;
    } else if (line.trim() && last) {
      // continuation of a multi-line message (no timestamp prefix)
      last.text += "\n" + line;
    }
  }

  const dates = messages.map((m) => m.date);
  const dateRange = dates.length
    ? {
        start: dates.reduce((a, b) => (a < b ? a : b)),
        end: dates.reduce((a, b) => (a > b ? a : b)),
      }
    : null;

  return {
    roomName,
    participants: [...participants],
    messageCount: messages.length,
    dateRange,
    messages,
    droppedSystem,
    droppedMedia,
  };
}

// ---------------------------------------------------------------------------
// Serialization / chunking (used by the server action)
// ---------------------------------------------------------------------------

// Chars per analysis window. Gemini flash-lite has a huge input context, so we
// use large windows to keep the number of sequential calls low; the classifier
// only emits compact work items, so output stays well within the token budget.
export const KAKAO_CHUNK_CHARS = 45000;
// Smaller windows for the Hermes agent path: Hermes is much slower than Gemini
// (~70s per ~18KB window), so smaller chunks keep each proxy round-trip under the
// serverless function ceiling while the client drives them one at a time.
export const KAKAO_AGENT_CHUNK_CHARS = 18000;
// Hard cap on windows so a multi-year chat can't fan out into endless API calls.
export const KAKAO_MAX_CHUNKS = 20;

function messageLine(m: KakaoMessage): string {
  return `${m.date} ${m.time} ${m.speaker}: ${m.text.replace(/\n/g, " ")}`;
}

/** One line per message: "YYYY-MM-DD HH:mm 발화자: 내용". */
export function messagesToText(msgs: KakaoMessage[]): string {
  return msgs.map(messageLine).join("\n");
}

/** Split messages into windows under `maxChars` (measured on the serialized
 *  form). Splits only on message boundaries, never mid-message. */
export function chunkMessages(
  msgs: KakaoMessage[],
  maxChars = KAKAO_CHUNK_CHARS,
): KakaoMessage[][] {
  const chunks: KakaoMessage[][] = [];
  let cur: KakaoMessage[] = [];
  let len = 0;
  for (const m of msgs) {
    const add = messageLine(m).length + 1;
    if (len + add > maxChars && cur.length) {
      chunks.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(m);
    len += add;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

// ---------------------------------------------------------------------------
// Group → ImportPlan (reuses the existing commitImport pipeline)
// ---------------------------------------------------------------------------

const UNASSIGNED = "미분류";

// Accept `unknown` so both the (typed) groupToPlan path and the (raw AI/agent
// output) merge path can share these — invalid values fall back to a default.
function coerceStatus(v: unknown): TaskStatusKey {
  return typeof v === "string" && (TASK_STATUS_VALUES as readonly string[]).includes(v)
    ? (v as TaskStatusKey)
    : "TODO";
}

function coercePriority(v: unknown): TaskPriorityKey {
  return typeof v === "string" && (TASK_PRIORITY_VALUES as readonly string[]).includes(v)
    ? (v as TaskPriorityKey)
    : "MEDIUM";
}

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s || undefined;
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "");
}

function toISODate(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const m = v.trim().match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : undefined;
}

// ---------------------------------------------------------------------------
// Raw AI/agent chunk output → merged, project-matched groups
// ---------------------------------------------------------------------------

// One group as emitted by Gemini or the Hermes agent for a single chunk, before
// merge/dedup/project-matching. Shared so both engines feed the same builder.
export type KakaoRawGroup = {
  projectName?: unknown;
  summary?: unknown;
  tasks?: Array<Record<string, unknown>>;
  requirements?: Array<Record<string, unknown>>;
};

// Fold one chunk's group into the running accumulator, deduping tasks by title
// and requirements by name (normalized), concatenating summaries.
function mergeGroupInto(
  g: KakaoRawGroup,
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
// then containment when exactly one project matches). "미분류"/no-match stay null.
function matchProjectId(
  name: string,
  projects: { id: string; name: string }[],
): string | null {
  if (name === UNASSIGNED) return null;
  const n = norm(name);
  const exact = projects.find((p) => norm(p.name) === n);
  if (exact) return exact.id;
  const partials = projects.filter((p) => {
    const pn = norm(p.name);
    return pn.length >= 2 && (n.includes(pn) || pn.includes(n));
  });
  return partials.length === 1 ? partials[0].id : null;
}

/** Merge all raw chunk groups (from any engine, in chunk order) into deduped,
 *  project-matched, sorted groups. Pure — shared by the Gemini server action
 *  and the client-driven Hermes agent path. */
export function buildKakaoGroups(
  rawGroups: KakaoRawGroup[],
  projects: { id: string; name: string }[],
): KakaoGroup[] {
  const byKey = new Map<string, KakaoGroup>();
  const taskSeen = new Map<string, Set<string>>();
  const reqSeen = new Map<string, Set<string>>();
  for (const g of rawGroups) mergeGroupInto(g, byKey, taskSeen, reqSeen);

  const groups = [...byKey.values()];
  for (const g of groups) g.projectId = matchProjectId(g.projectName, projects);

  // Matched projects first, 미분류 last; within each, richer groups first.
  groups.sort((a, b) => {
    const au = a.projectName === UNASSIGNED ? 1 : 0;
    const bu = b.projectName === UNASSIGNED ? 1 : 0;
    if (au !== bu) return au - bu;
    return (
      b.tasks.length + b.requirements.length - (a.tasks.length + a.requirements.length)
    );
  });
  return groups;
}

/** Build an ImportPlan for one project group. `commitImport` then writes the
 *  anchor note (conversation), kanban tasks, PMS 업무 TASK, and requirements. */
export function groupToPlan(g: KakaoGroup, roomName: string): ImportPlan {
  const label = g.projectName || UNASSIGNED;
  const isUnassigned = label === UNASSIGNED;
  const summary =
    g.summary?.trim() || `${roomName} 대화에서 정리된 ${label} 관련 내용입니다.`;

  const anchor: PlanNote = {
    key: "doc",
    title: `${label} — 카카오톡 대화 (${roomName})`,
    type: "EPISODIC",
    summary: summary.split("\n")[0]?.slice(0, 200),
    content: summary,
    tags: ["카카오톡", ...(isUnassigned ? [] : [label])],
  };

  const tasks: PlanTask[] = g.tasks.map((t) => ({
    title: t.title,
    status: coerceStatus(t.status),
    priority: coercePriority(t.priority),
    description: t.description || undefined,
  }));

  // Same items also land in the PMS "업무 TASK" submenu (name = task title).
  const pmsTasks: PlanPmsTask[] = g.tasks.map((t) => ({
    name: t.title,
    status: coerceStatus(t.status),
    priority: coercePriority(t.priority),
  }));

  const requirements: PlanRequirement[] = g.requirements.map((r) => ({
    name: r.name,
    category: r.category || undefined,
    detail: r.detail || undefined,
    acceptance: r.acceptance || undefined,
    requestDate: r.requestDate || undefined,
    dueDate: r.dueDate || undefined,
    targetDate: r.targetDate || undefined,
  }));

  return {
    documentTitle: `${label} · ${roomName}`,
    projectName: isUnassigned ? undefined : label,
    notes: [anchor],
    edges: [],
    tasks,
    pmsTasks,
    requirements,
  };
}

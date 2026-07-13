import "server-only";
import type {
  ImportPlan,
  PlanNote,
  PlanEdge,
  PlanTask,
  PlanRequirement,
  PlanRequirementSpec,
  PlanWbsItem,
  PlanDeliverable,
} from "@/lib/import";
import type { NodeTypeKey } from "@/lib/theme";
import { extractMetadata } from "./metadata";

const TASK_HEADING =
  /(할\s*일|to-?do|todo|액션|action|task|과제|assignment|후속|follow)/i;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(.*\S)\s*$/;

// Section-heading matchers for the PMS submenus (checked most-specific first).
const SPEC_HEADING = /(명세|스펙|기능\s*정의|spec)/i;
const REQ_HEADING = /(요구\s*사항|과업|requirement)/i;
const WBS_HEADING = /(wbs|작업\s*분해|일정\s*계획|업무\s*분해)/i;
const DELIV_HEADING = /(산출물|납품물|deliverable|output)/i;
const DATE_RE = /(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/;

/** List item text with any trailing/embedded `YYYY-MM-DD` pulled out. */
function listItems(body: string[]): { text: string; date?: string }[] {
  const out: { text: string; date?: string }[] = [];
  for (const raw of body) {
    const m = raw.match(LIST_ITEM);
    if (!m) continue;
    let text = m[1].replace(/^\[[ xX]\]\s*/, "").trim();
    let date: string | undefined;
    const dm = text.match(DATE_RE);
    if (dm) {
      date = `${dm[1]}-${dm[2].padStart(2, "0")}-${dm[3].padStart(2, "0")}`;
      text = text
        .replace(dm[0], "")
        .replace(/[([\])·:~\-–—]\s*$/, "")
        .trim();
    }
    if (text) out.push({ text, date });
  }
  return out;
}

type Section = { heading: string; body: string[] };

/** Best-effort PMS items from section headings + list items (AI-mode fallback). */
function extractPms(sections: Section[]) {
  const requirements: PlanRequirement[] = [];
  const requirementSpecs: PlanRequirementSpec[] = [];
  const wbsItems: PlanWbsItem[] = [];
  const deliverables: PlanDeliverable[] = [];
  let w = 0;

  for (const s of sections) {
    const items = listItems(s.body);
    if (!items.length) continue;
    if (SPEC_HEADING.test(s.heading)) {
      for (const it of items)
        requirementSpecs.push({ name: it.text, dueDate: it.date });
    } else if (REQ_HEADING.test(s.heading)) {
      for (const it of items)
        requirements.push({ name: it.text, dueDate: it.date });
    } else if (WBS_HEADING.test(s.heading)) {
      for (const it of items)
        wbsItems.push({ key: `w${w++}`, name: it.text, endDate: it.date });
    } else if (DELIV_HEADING.test(s.heading)) {
      for (const it of items) deliverables.push({ name: it.text });
    }
  }
  // No pmsTasks here by design: actionable "할 일" sections already become
  // kanban `tasks` (via TASK_HEADING). PmsTask is populated only in AI mode.
  return { requirements, requirementSpecs, wbsItems, deliverables };
}

/** Best-effort node type from a section heading. */
function guessType(heading: string): NodeTypeKey {
  if (/(절차|방법|프로세스|구현|처리|등록|기능|설정|가이드|how)/i.test(heading))
    return "PROCEDURAL";
  if (/(결정|방침|원칙|전략|목표|비전|제안|합의)/.test(heading)) return "THESIS";
  if (/(회고|인사이트|의견|느낌|디자인|배경|현황)/.test(heading))
    return "REFLECTIVE";
  return "SEMANTIC";
}

/** First meaningful sentence, stripped of markdown, for a summary. */
function firstSentence(text: string): string | undefined {
  const line = text
    .split("\n")
    .map((l) => l.replace(/^[#>\-*+\d.)\s]+/, "").trim())
    .find((l) => l.length > 0);
  if (!line) return undefined;
  const s = line.split(/(?<=[.。!?])\s/)[0];
  return s.length > 160 ? s.slice(0, 157) + "…" : s;
}

function extractTasks(body: string[]): PlanTask[] {
  const tasks: PlanTask[] = [];
  for (const raw of body) {
    const m = raw.match(LIST_ITEM);
    if (!m) continue;
    let title = m[1];
    const done = /^\[[xX]\]/.test(title);
    title = title.replace(/^\[[ xX]\]\s*/, "").trim();
    if (title) tasks.push({ title, status: done ? "DONE" : "TODO", priority: "MEDIUM" });
  }
  return tasks;
}

/**
 * Deterministic markdown → plan. Creates one EPISODIC "source" note holding the
 * whole document, one note per H2 section, edges from the source to each section,
 * and tasks from any "할 일 / To-do / Action" section's list items.
 */
export function analyzeHeuristic(
  markdown: string,
  fallbackTitle: string,
): ImportPlan {
  const meta = extractMetadata(markdown);
  const lines = meta.body.split("\n");

  let documentTitle = fallbackTitle;
  const h1 = lines.find((l) => /^#\s+/.test(l));
  if (h1) documentTitle = h1.replace(/^#\s+/, "").trim();
  if (meta.title) documentTitle = meta.title;

  const sections: Section[] = [];
  let current: Section | null = null;
  const preamble: string[] = [];
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (current) sections.push(current);
      current = { heading: line.replace(/^##\s+/, "").trim(), body: [] };
    } else if (/^#\s+/.test(line)) {
      // H1 is the title — skip
    } else if (current) {
      current.body.push(line);
    } else {
      preamble.push(line);
    }
  }
  if (current) sections.push(current);

  const notes: PlanNote[] = [];
  const edges: PlanEdge[] = [];
  const tasks: PlanTask[] = [];

  notes.push({
    key: "doc",
    title: documentTitle,
    type: "EPISODIC",
    summary: firstSentence(preamble.join("\n")) ?? firstSentence(meta.body),
    content: meta.body,
    tags: meta.tags,
  });

  let i = 0;
  for (const s of sections) {
    if (TASK_HEADING.test(s.heading)) {
      tasks.push(...extractTasks(s.body));
      continue; // task sections don't become notes
    }
    const bodyText = s.body.join("\n").trim();
    if (!bodyText && !s.heading) continue;
    const key = `s${i++}`;
    notes.push({
      key,
      title: s.heading,
      type: guessType(s.heading),
      summary: firstSentence(bodyText),
      content: `## ${s.heading}\n\n${bodyText}`,
      tags: [],
    });
    edges.push({ sourceKey: "doc", targetKey: key, type: "MENTIONS" });
  }

  return {
    // No document-title fallback for topic: commitImport fills it from the
    // resolved project name so same-project files share one topic.
    documentTitle,
    topicName: meta.topic,
    projectName: meta.project,
    notes,
    edges,
    tasks,
    ...extractPms(sections),
  };
}

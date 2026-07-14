import "server-only";

// Orchestrates the three Google sync scenarios for one user. Thin REST wrappers
// live in gmail/calendar/sheets.ts; this file holds the PMS-aware logic and the
// idempotency bookkeeping (Gmail sourceKey, GoogleCalendarLink diff, sheet snapshot).
import { prisma } from "@/server/db";
import { toDateInputValue } from "@/lib/utils";
import { GoogleTokenError } from "./auth";
import { listMessageIds, getMessage } from "./gmail";
import {
  calendarExists,
  createCalendar,
  deleteEvent,
  insertEvent,
  patchEvent,
  type AllDayEvent,
} from "./calendar";
import {
  clearAndWrite,
  createSpreadsheet,
  ensureSheet,
  getSheetTitles,
  type CellValue,
} from "./sheets";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// 한 번의 동기화에서 나열할 최대 메시지 id 수(안전 상한)와 실제 본문을 받아
// 임포트할 상한(서버리스 실행시간 보호). 백로그는 여러 실행에 걸쳐 소진된다.
const GMAIL_MAX_IDS = 500;
const GMAIL_PROCESS_CAP = 40;

async function requireAccount(userId: string) {
  const acct = await prisma.googleAccount.findUnique({ where: { userId } });
  if (!acct) throw new GoogleTokenError("구글 계정이 연결되어 있지 않습니다.");
  if (acct.status === "REVOKED") {
    throw new GoogleTokenError("구글 연결이 취소되었습니다. 다시 연결해 주세요.");
  }
  return acct;
}

// --- Gmail → CollectedMail -------------------------------------------------
export type GmailSyncResult = {
  collected: number; // 이번에 새로 저장한 메일 수
  scanned: number; // 본문 조회를 시도한 새 메일 수
  failed: number;
  skipped: boolean; // 검색 규칙 미설정
  hasMore: boolean; // 처리 상한(cap)에 걸려 남은 새 메일이 있음 → 다시 실행 권장
};

// 증분 기본 조회 창(넉넉히 1년). full 백필은 날짜 제한 없이 전체를 훑는다. 어느
// 쪽이든 이미 수집된 메시지(messageId)는 건너뛰므로 여러 실행에 걸쳐 소진된다.
const GMAIL_WINDOW = "newer_than:1y";

/**
 * 사용자의 GmailLabelRule(검색 키워드→프로젝트, N개)을 순회하며 각 키워드가 메일
 * 제목·발신자·본문 중 하나라도 매칭되는 메일을 CollectedMail로 수집한다. 메일은
 * 불변이라 이미 수집된 messageId는 건너뛰고, 새 메일만 oldest-first로 저장하되 전역
 * CAP(실행당 총 처리 상한)을 지킨다. 각 메일엔 그 규칙의 projectId를 심어 노트 변환 시
 * 해당 프로젝트로 연결. `full`이면 날짜 제한 없이 전체 백필. 규칙이 하나도 없으면
 * 아무것도 안 함(skipped).
 */
export async function runGmailSync(
  userId: string,
  opts: { full?: boolean } = {},
): Promise<GmailSyncResult> {
  await requireAccount(userId);
  const rules = await prisma.gmailLabelRule.findMany({ where: { userId } });
  if (rules.length === 0) {
    return { collected: 0, scanned: 0, failed: 0, skipped: true, hasMore: false };
  }

  let collected = 0;
  let failed = 0;
  let scanned = 0; // 전역(모든 규칙 합산) 처리 카운터 — CAP의 기준
  let remainingNew = 0;
  // 한 메일이 여러 라벨에 걸릴 수 있으므로, 이번 run에서 이미 다룬 messageId를 기억해
  // 규칙 간 중복 저장(unique 충돌)을 막는다. 먼저 매칭된 규칙의 프로젝트가 적용된다.
  const seen = new Set<string>();

  for (const rule of rules) {
    // rule.label은 (Gmail 라벨명이 아니라) 검색 키워드다. 제목·발신자·본문 중
    // 하나라도 매칭(OR)되는 메일을 수집한다. JSON.stringify로 따옴표를 감싸
    // 공백 포함 문구를 지원하고 Gmail 연산자 인젝션도 막는다. 본문 전용 연산자가
    // 없으므로 실제 매칭은 마지막 bare 항목이 전담한다(제목·발신자·본문·수신자 등
    // 전체 전문검색). subject:/from:은 사실상 이 superset에 포함되지만, "제목·발신자"
    // 의도를 코드에 남기고 향후 필드별 세분화에 대비하려 명시적으로 함께 둔다.
    const kw = JSON.stringify(rule.label);
    const parts = [`(subject:${kw} OR from:${kw} OR ${kw})`];
    if (!opts.full) parts.push(GMAIL_WINDOW);
    const ids = await listMessageIds(userId, { query: parts.join(" "), max: GMAIL_MAX_IDS });
    const queue = [...ids].reverse(); // 최신순 → oldest-first

    const existing = new Set(
      ids.length
        ? (
            await prisma.collectedMail.findMany({
              where: { userId, messageId: { in: ids } },
              select: { messageId: true },
            })
          ).map((r) => r.messageId)
        : [],
    );

    for (const id of queue) {
      if (existing.has(id) || seen.has(id)) continue; // 이미 수집/이번 run 처리됨
      if (scanned >= GMAIL_PROCESS_CAP) {
        remainingNew++;
        continue;
      }
      scanned++;
      seen.add(id);

      let msg;
      try {
        msg = await getMessage(userId, id);
      } catch {
        failed++;
        continue;
      }
      try {
        await prisma.collectedMail.create({
          data: {
            userId,
            messageId: msg.id,
            threadId: msg.threadId,
            subject: msg.subject,
            fromAddr: msg.from,
            toAddr: msg.to || null,
            snippet: msg.snippet || null,
            body: msg.body,
            internalDate: msg.internalDateMs ? new Date(msg.internalDateMs) : null,
            labels: rule.label, // 매칭된 검색 키워드(참고용)
            projectId: rule.projectId,
          },
        });
        collected++;
      } catch {
        // 동시 실행 등으로 인한 unique 충돌은 무시(이미 저장됨).
        failed++;
      }
    }
  }

  // gmailSyncedAt은 이제 "마지막 수집 시각" 표시용(쿼리 커서로는 안 씀).
  await prisma.googleAccount.update({
    where: { userId },
    data: { gmailSyncedAt: new Date() },
  });
  return { collected, scanned, failed, skipped: false, hasMore: remainingNew > 0 };
}

// --- 마감일 → 캘린더 -------------------------------------------------------
export type CalendarSyncResult = { created: number; updated: number; deleted: number };

type CalTarget = {
  key: string;
  entityType: string;
  entityId: string;
  dateField: string;
  event: AllDayEvent;
};

// Collect every (entity, date) that should have a calendar event. "마감일"
// scope: due/end dates across the PMS domains + project end.
//
// NOTE: this reads ALL projects/tasks unscoped, matching the app's current
// single-workspace model (auth.ts getScope().where === {}), so a connected user
// exports the same data they already see everywhere in the UI. When real
// per-user/workspace isolation lands, thread the scope through here (and through
// buildSheetDatasets below) so one user doesn't export another's deadlines.
async function gatherCalendarTargets(): Promise<CalTarget[]> {
  const projects = await prisma.project.findMany({
    select: { id: true, name: true, endDate: true },
  });
  const projName = new Map(projects.map((p) => [p.id, p.name]));
  const out: CalTarget[] = [];

  const add = (
    entityType: string,
    entityId: string,
    dateField: string,
    date: Date | null,
    summary: string,
    description?: string,
  ) => {
    if (!date) return;
    const ymd = toDateInputValue(date);
    if (!ymd) return;
    out.push({
      key: `${entityType}:${entityId}:${dateField}`,
      entityType,
      entityId,
      dateField,
      event: {
        summary,
        description,
        date: ymd,
        privateProps: {
          pmsEntityType: entityType,
          pmsEntityId: entityId,
          pmsDateField: dateField,
        },
      },
    });
  };

  for (const p of projects) {
    add("PROJECT", p.id, "endDate", p.endDate, `[프로젝트 마감] ${p.name}`);
  }
  const tasks = await prisma.task.findMany({
    where: { dueDate: { not: null } },
    select: { id: true, title: true, dueDate: true, projectId: true },
  });
  for (const t of tasks) {
    add("TASK", t.id, "dueDate", t.dueDate, `[작업] ${t.title}`, projName.get(t.projectId));
  }
  const wbs = await prisma.wBSItem.findMany({
    where: { endDate: { not: null } },
    select: { id: true, name: true, endDate: true, projectId: true },
  });
  for (const w of wbs) {
    add("WBS", w.id, "endDate", w.endDate, `[WBS] ${w.name}`, projName.get(w.projectId));
  }
  const pmsTasks = await prisma.pmsTask.findMany({
    where: { endDate: { not: null } },
    select: { id: true, name: true, endDate: true, projectId: true },
  });
  for (const t of pmsTasks) {
    add("PMS_TASK", t.id, "endDate", t.endDate, `[업무] ${t.name}`, projName.get(t.projectId));
  }
  const reqs = await prisma.requirement.findMany({
    where: { dueDate: { not: null } },
    select: { id: true, name: true, dueDate: true, projectId: true },
  });
  for (const r of reqs) {
    add("REQUIREMENT", r.id, "dueDate", r.dueDate, `[요구사항] ${r.name}`, projName.get(r.projectId));
  }
  const specs = await prisma.requirementSpec.findMany({
    where: { dueDate: { not: null } },
    select: { id: true, name: true, dueDate: true, projectId: true },
  });
  for (const s of specs) {
    add("REQUIREMENT_SPEC", s.id, "dueDate", s.dueDate, `[명세] ${s.name}`, projName.get(s.projectId));
  }
  return out;
}

/** 시스템→캘린더 단방향 동기화. 매핑 테이블과 diff해 생성/갱신/삭제. */
export async function runCalendarSync(userId: string): Promise<CalendarSyncResult> {
  await requireAccount(userId);

  // 전용 "PMS 일정" 캘린더 확보(없거나 삭제됐으면 생성).
  const acct = await prisma.googleAccount.findUnique({ where: { userId } });
  let calendarId = acct?.calendarId ?? null;
  if (calendarId) {
    // 404만 재생성 트리거. 일시적 네트워크/권한 오류는 true로 간주해 기존 캘린더를
    // 유지한다(잘못 재생성하면 중복 캘린더가 쌓임). 실제 삭제라면 이후 insert/patch가
    // 404→missing으로 자가 복구한다.
    const ok = await calendarExists(userId, calendarId).catch((e) => {
      console.warn("[google] 캘린더 확인 실패, 기존 캘린더 유지", e);
      return true;
    });
    if (!ok) calendarId = null;
  }
  if (!calendarId) {
    calendarId = await createCalendar(userId, "PMS 일정");
    await prisma.googleAccount.update({ where: { userId }, data: { calendarId } });
  }

  const desired = await gatherCalendarTargets();
  const desiredKeys = new Set(desired.map((d) => d.key));
  const links = await prisma.googleCalendarLink.findMany({ where: { userId } });
  const linkByKey = new Map(
    links.map((l) => [`${l.entityType}:${l.entityId}:${l.dateField}`, l]),
  );

  let created = 0;
  let updated = 0;
  let deleted = 0;

  for (const d of desired) {
    const existing = linkByKey.get(d.key);
    if (existing) {
      const r = await patchEvent(userId, calendarId, existing.googleEventId, d.event);
      if (r.missing) {
        const evId = await insertEvent(userId, calendarId, d.event);
        await prisma.googleCalendarLink.update({
          where: { id: existing.id },
          data: { googleEventId: evId },
        });
        created++;
      } else {
        updated++;
      }
    } else {
      const evId = await insertEvent(userId, calendarId, d.event);
      await prisma.googleCalendarLink.create({
        data: {
          userId,
          entityType: d.entityType,
          entityId: d.entityId,
          dateField: d.dateField,
          googleEventId: evId,
        },
      });
      created++;
    }
  }

  // 더 이상 유효하지 않은 매핑 → 이벤트 삭제 후 매핑 제거.
  for (const l of links) {
    const key = `${l.entityType}:${l.entityId}:${l.dateField}`;
    if (!desiredKeys.has(key)) {
      await deleteEvent(userId, calendarId, l.googleEventId).catch(() => {});
      await prisma.googleCalendarLink.delete({ where: { id: l.id } });
      deleted++;
    }
  }

  return { created, updated, deleted };
}

// --- PMS → 시트 ------------------------------------------------------------
export type SheetsSyncResult = { spreadsheetId: string; tabs: number; rows: number };

type SheetDataset = { title: string; header: string[]; rows: CellValue[][] };

const ymd = (d: Date | null): string => (d ? toDateInputValue(d) : "");

async function buildSheetDatasets(): Promise<SheetDataset[]> {
  const projects = await prisma.project.findMany({ orderBy: { createdAt: "asc" } });
  const projName = new Map(projects.map((p) => [p.id, p.name]));
  const pn = (id: string) => projName.get(id) ?? "";

  const [tasks, reqs, specs, wbs, pmsTasks, deliverables] = await Promise.all([
    prisma.task.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.requirement.findMany({ orderBy: [{ projectId: "asc" }, { sortOrder: "asc" }] }),
    prisma.requirementSpec.findMany({ orderBy: [{ projectId: "asc" }, { sortOrder: "asc" }] }),
    prisma.wBSItem.findMany({ orderBy: [{ projectId: "asc" }, { sortOrder: "asc" }] }),
    prisma.pmsTask.findMany({ orderBy: [{ projectId: "asc" }, { sortOrder: "asc" }] }),
    prisma.deliverable.findMany({ orderBy: [{ projectId: "asc" }, { sortOrder: "asc" }] }),
  ]);

  return [
    {
      title: "프로젝트",
      header: ["이름", "상태", "시작일", "종료일"],
      rows: projects.map((p) => [p.name, p.status, ymd(p.startDate), ymd(p.endDate)]),
    },
    {
      title: "작업",
      header: ["프로젝트", "제목", "상태", "우선순위", "마감일"],
      rows: tasks.map((t) => [pn(t.projectId), t.title, t.status, t.priority, ymd(t.dueDate)]),
    },
    {
      title: "요구사항정의",
      header: ["프로젝트", "이름", "분류", "수용여부", "마감일"],
      rows: reqs.map((r) => [pn(r.projectId), r.name, r.category, r.acceptance, ymd(r.dueDate)]),
    },
    {
      title: "요구사항명세",
      header: ["프로젝트", "이름", "상태", "중요도", "진행률", "마감일"],
      rows: specs.map((s) => [pn(s.projectId), s.name, s.status, s.importance, s.progress, ymd(s.dueDate)]),
    },
    {
      title: "WBS",
      header: ["프로젝트", "코드", "이름", "담당", "상태", "진행률", "시작일", "종료일"],
      rows: wbs.map((w) => [pn(w.projectId), w.code ?? "", w.name, w.assignee ?? "", w.status, w.progress, ymd(w.startDate), ymd(w.endDate)]),
    },
    {
      title: "업무",
      header: ["프로젝트", "코드", "이름", "담당", "상태", "진행률", "시작일", "종료일"],
      rows: pmsTasks.map((t) => [pn(t.projectId), t.code ?? "", t.name, t.assignee ?? "", t.status, t.progress, ymd(t.startDate), ymd(t.endDate)]),
    },
    {
      title: "산출물",
      header: ["프로젝트", "이름", "설명"],
      rows: deliverables.map((d) => [pn(d.projectId), d.name, d.description ?? ""]),
    },
  ];
}

/** PMS 전체 스냅샷을 스프레드시트 탭별로 덮어쓰기. */
export async function runSheetsSync(userId: string): Promise<SheetsSyncResult> {
  await requireAccount(userId);

  const acct = await prisma.googleAccount.findUnique({ where: { userId } });
  let spreadsheetId = acct?.sheetsSpreadsheetId ?? null;
  let titles: string[] | null = null;
  if (spreadsheetId) {
    titles = await getSheetTitles(userId, spreadsheetId).catch(() => null);
    if (titles === null) spreadsheetId = null; // 삭제됨 → 재생성
  }
  if (!spreadsheetId) {
    spreadsheetId = await createSpreadsheet(userId, "PMS 리포트");
    await prisma.googleAccount.update({
      where: { userId },
      data: { sheetsSpreadsheetId: spreadsheetId },
    });
    titles = [];
  }

  const datasets = await buildSheetDatasets();
  let rows = 0;
  for (const ds of datasets) {
    await ensureSheet(userId, spreadsheetId, ds.title, titles!);
    await clearAndWrite(userId, spreadsheetId, ds.title, [ds.header, ...ds.rows]);
    rows += ds.rows.length;
  }
  return { spreadsheetId, tabs: datasets.length, rows };
}

// --- 전체(크론 공용) -------------------------------------------------------
export type UserSyncResult = {
  gmail: GmailSyncResult | null;
  calendar: CalendarSyncResult | null;
  sheets: SheetsSyncResult | null;
  errors: string[];
};

/** 한 사용자의 3개 시나리오를 격리 실행(하나 실패해도 나머지 진행). */
export async function runAllForUser(userId: string): Promise<UserSyncResult> {
  const errors: string[] = [];
  let gmail: GmailSyncResult | null = null;
  let calendar: CalendarSyncResult | null = null;
  let sheets: SheetsSyncResult | null = null;

  try {
    gmail = await runGmailSync(userId);
  } catch (e) {
    errors.push(`gmail: ${errMsg(e)}`);
  }
  try {
    calendar = await runCalendarSync(userId);
  } catch (e) {
    errors.push(`calendar: ${errMsg(e)}`);
  }
  try {
    sheets = await runSheetsSync(userId);
  } catch (e) {
    errors.push(`sheets: ${errMsg(e)}`);
  }

  return { gmail, calendar, sheets, errors };
}

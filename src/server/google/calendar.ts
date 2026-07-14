import "server-only";

// Google Calendar REST client — thin wrappers over calendars/events. Orchestration
// (find-or-create the "PMS 일정" calendar, diff against GoogleCalendarLink) lives
// in sync.ts. All events here are all-day (start.date / exclusive end.date).
import { googleApiFetch, googleJson, jsonBody, GoogleApiError } from "./client";

const BASE = "https://www.googleapis.com/calendar/v3";

export type AllDayEvent = {
  summary: string;
  description?: string;
  /** YYYY-MM-DD (all-day). */
  date: string;
  /** stored under extendedProperties.private for mapping recovery */
  privateProps?: Record<string, string>;
};

/** all-day 이벤트의 end.date는 배타적이라 시작일 +1일로 설정. */
function nextDay(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function eventBody(input: AllDayEvent) {
  return {
    summary: input.summary,
    description: input.description,
    start: { date: input.date },
    end: { date: nextDay(input.date) },
    ...(input.privateProps ? { extendedProperties: { private: input.privateProps } } : {}),
  };
}

/** 보조 캘린더 생성 → calendarId 반환. */
export async function createCalendar(userId: string, summary: string): Promise<string> {
  const res = await googleApiFetch(
    userId,
    `${BASE}/calendars`,
    jsonBody({ summary, timeZone: "Asia/Seoul" }),
  );
  const json = await googleJson<{ id: string }>(res, "구글 캘린더 생성");
  return json.id;
}

/** calendarId가 아직 존재하는지 확인(삭제됐으면 false). */
export async function calendarExists(userId: string, calendarId: string): Promise<boolean> {
  const res = await googleApiFetch(
    userId,
    `${BASE}/calendars/${encodeURIComponent(calendarId)}`,
  );
  if (res.status === 404) return false;
  await googleJson<unknown>(res, "구글 캘린더 확인");
  return true;
}

/** 이벤트 생성 → eventId 반환. */
export async function insertEvent(
  userId: string,
  calendarId: string,
  input: AllDayEvent,
): Promise<string> {
  const res = await googleApiFetch(
    userId,
    `${BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
    jsonBody(eventBody(input)),
  );
  const json = await googleJson<{ id: string }>(res, "구글 캘린더 이벤트 생성");
  return json.id;
}

/** 기존 이벤트 갱신. 이벤트가 사라졌으면(404/410) 삭제된 것으로 알림. */
export async function patchEvent(
  userId: string,
  calendarId: string,
  eventId: string,
  input: AllDayEvent,
): Promise<{ missing: boolean }> {
  const res = await googleApiFetch(
    userId,
    `${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { ...jsonBody(eventBody(input)), method: "PATCH" },
  );
  if (res.status === 404 || res.status === 410) return { missing: true };
  await googleJson<unknown>(res, "구글 캘린더 이벤트 수정");
  return { missing: false };
}

/** 이벤트 삭제. 이미 없으면(404/410) 조용히 성공 처리. */
export async function deleteEvent(
  userId: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const res = await googleApiFetch(
    userId,
    `${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
  );
  if (res.ok || res.status === 404 || res.status === 410) return;
  const text = await res.text().catch(() => "");
  console.error("[google] 캘린더 이벤트 삭제", res.status, text.slice(0, 200));
  throw new GoogleApiError(`구글 캘린더 이벤트 삭제 오류(HTTP ${res.status}).`, res.status);
}

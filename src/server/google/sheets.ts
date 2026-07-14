import "server-only";

// Google Sheets REST client — create a spreadsheet, ensure named tabs exist, and
// overwrite a tab's values (snapshot export). Orchestration lives in sync.ts.
import { googleApiFetch, googleJson, jsonBody } from "./client";

const BASE = "https://sheets.googleapis.com/v4/spreadsheets";

export type CellValue = string | number;

/** 스프레드시트 생성 → spreadsheetId 반환. */
export async function createSpreadsheet(userId: string, title: string): Promise<string> {
  const res = await googleApiFetch(
    userId,
    BASE,
    jsonBody({ properties: { title } }),
  );
  const json = await googleJson<{ spreadsheetId: string }>(res, "구글 시트 생성");
  return json.spreadsheetId;
}

/** 현재 존재하는 시트(탭) 제목 목록. 스프레드시트가 없으면 null. */
export async function getSheetTitles(
  userId: string,
  spreadsheetId: string,
): Promise<string[] | null> {
  const res = await googleApiFetch(
    userId,
    `${BASE}/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties.title`,
  );
  if (res.status === 404) return null;
  const json = await googleJson<{ sheets?: { properties?: { title?: string } }[] }>(
    res,
    "구글 시트 조회",
  );
  return (json.sheets ?? []).map((s) => s.properties?.title ?? "").filter(Boolean);
}

/** 없는 탭이면 추가. (batchUpdate addSheet) */
export async function ensureSheet(
  userId: string,
  spreadsheetId: string,
  title: string,
  existingTitles: string[],
): Promise<void> {
  if (existingTitles.includes(title)) return;
  const res = await googleApiFetch(
    userId,
    `${BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
    jsonBody({ requests: [{ addSheet: { properties: { title } } }] }),
  );
  await googleJson<unknown>(res, "구글 시트 탭 추가");
  existingTitles.push(title);
}

/** 탭 전체를 지우고 values로 덮어쓰기(스냅샷). */
export async function clearAndWrite(
  userId: string,
  spreadsheetId: string,
  sheetTitle: string,
  values: CellValue[][],
): Promise<void> {
  const idEnc = encodeURIComponent(spreadsheetId);
  // In A1 notation a quoted sheet name escapes an inner apostrophe by doubling it.
  const quoted = `'${sheetTitle.replace(/'/g, "''")}'`;

  const clearRes = await googleApiFetch(
    userId,
    `${BASE}/${idEnc}/values/${encodeURIComponent(quoted)}:clear`,
    jsonBody({}),
  );
  await googleJson<unknown>(clearRes, "구글 시트 초기화");

  const writeRes = await googleApiFetch(
    userId,
    `${BASE}/${idEnc}/values/${encodeURIComponent(`${quoted}!A1`)}?valueInputOption=RAW`,
    { ...jsonBody({ values }), method: "PUT" },
  );
  await googleJson<unknown>(writeRes, "구글 시트 쓰기");
}

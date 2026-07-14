import "server-only";

// Gmail REST client (read-only). Lists message ids for a query and fetches a
// single message, extracting a plain-text body + key headers for import.
import { googleApiFetch, googleJson } from "./client";

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

type GmailPart = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
  headers?: { name: string; value: string }[];
};

type GmailRawMessage = {
  id: string;
  threadId?: string;
  internalDate?: string;
  snippet?: string;
  payload?: GmailPart;
};

export type GmailMessage = {
  id: string;
  threadId: string | null;
  internalDateMs: number;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  body: string;
};

/**
 * 쿼리에 매칭되는 메시지 id 목록(API 순서 = 최신순). q 예: "newer_than:7d label:PMS".
 * nextPageToken으로 opts.max 까지 페이지네이션한다(id만 받으므로 저렴).
 */
export async function listMessageIds(
  userId: string,
  opts: { query: string; max: number },
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const qs = new URLSearchParams({
      q: opts.query,
      maxResults: String(Math.min(100, opts.max - ids.length)),
    });
    if (pageToken) qs.set("pageToken", pageToken);
    const res = await googleApiFetch(userId, `${BASE}/messages?${qs.toString()}`);
    const json = await googleJson<{
      messages?: { id: string }[];
      nextPageToken?: string;
    }>(res, "Gmail 목록 조회");
    for (const m of json.messages ?? []) ids.push(m.id);
    pageToken = json.nextPageToken;
  } while (pageToken && ids.length < opts.max);
  return ids;
}

function headerValue(payload: GmailPart | undefined, name: string): string {
  const h = payload?.headers?.find(
    (x) => x.name.toLowerCase() === name.toLowerCase(),
  );
  return h?.value ?? "";
}

function decodeB64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

// DFS for the first body part of the given mime type (skipping attachments).
function findBody(part: GmailPart | undefined, mime: string): string | null {
  if (!part) return null;
  if (part.mimeType === mime && part.body?.data && !part.filename) {
    return decodeB64Url(part.body.data);
  }
  for (const p of part.parts ?? []) {
    const found = findBody(p, mime);
    if (found) return found;
  }
  return null;
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 단일 메시지를 본문(text/plain 우선) + 헤더와 함께 조회. */
export async function getMessage(userId: string, id: string): Promise<GmailMessage> {
  const res = await googleApiFetch(userId, `${BASE}/messages/${id}?format=full`);
  const msg = await googleJson<GmailRawMessage>(res, "Gmail 메시지 조회");

  const plain = findBody(msg.payload, "text/plain");
  const body = plain ?? (() => {
    const html = findBody(msg.payload, "text/html");
    return html ? htmlToText(html) : "";
  })();

  return {
    id: msg.id,
    threadId: msg.threadId ?? null,
    internalDateMs: Number(msg.internalDate ?? 0),
    subject: headerValue(msg.payload, "Subject") || "(제목 없음)",
    from: headerValue(msg.payload, "From"),
    to: headerValue(msg.payload, "To"),
    date: headerValue(msg.payload, "Date"),
    snippet: msg.snippet ?? "",
    body,
  };
}

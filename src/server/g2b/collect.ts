import "server-only";
import { fetchServcBids, type G2bBidItem } from "./client";
import { termsForGroups, matchKeywordGroups } from "@/lib/g2b";
import { parseG2bDateTime } from "@/lib/utils";

export type CollectedBid = {
  bidNtceNo: string;
  bidNtceOrd: string;
  bidNtceNm: string;
  srvceDivNm: string | null;
  cntrctCnclsMthdNm: string | null;
  ntceInsttNm: string | null;
  dminsttNm: string | null;
  bidNtceDt: Date | null;
  bidClseDt: Date | null;
  opengDt: Date | null;
  presmptPrce: string | null;
  asignBdgtAmt: string | null;
  bidNtceDtlUrl: string | null;
  matchedKeywords: string[];
  raw: G2bBidItem;
};

export type CollectResult = {
  bids: CollectedBid[];
  apiCalls: number;
};

// Date → YYYYMMDDHHMM(KST). API는 KST 기준이므로 +9h 후 UTC getter로 자릿수 구성.
function fmtKstStamp(d: Date): string {
  const k = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return (
    `${k.getUTCFullYear()}` +
    `${String(k.getUTCMonth() + 1).padStart(2, "0")}` +
    `${String(k.getUTCDate()).padStart(2, "0")}` +
    `${String(k.getUTCHours()).padStart(2, "0")}` +
    `${String(k.getUTCMinutes()).padStart(2, "0")}`
  );
}

function s(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  return t || null;
}

/**
 * 선택 키워드 그룹의 모든 검색어로 용역 공고를 조회, 페이지 순회 후
 * (bidNtceNo, bidNtceOrd)로 dedup. DB 접근은 하지 않는다(순수 수집).
 * days는 15 이하 권장(API 요청당 기간 제한). 호출측에서 clamp.
 */
export async function collectServcBids(opts: {
  days: number;
  groupKeys?: string[];
  now?: Date;
}): Promise<CollectResult> {
  const now = opts.now ?? new Date();
  const bgnDt = fmtKstStamp(new Date(now.getTime() - opts.days * 24 * 60 * 60 * 1000));
  const endDt = fmtKstStamp(now);
  const terms = termsForGroups(opts.groupKeys);

  const NUM = 100;
  const byKey = new Map<string, CollectedBid>();
  let apiCalls = 0;

  for (const term of terms) {
    let page = 1;
    for (;;) {
      const { items, totalCount } = await fetchServcBids({
        keyword: term,
        bgnDt,
        endDt,
        pageNo: page,
        numOfRows: NUM,
      });
      apiCalls++;
      for (const it of items) {
        const no = s(it.bidNtceNo);
        if (!no) continue;
        const ord = s(it.bidNtceOrd) ?? "000";
        const id = `${no}:${ord}`;
        if (byKey.has(id)) continue;
        const name = s(it.bidNtceNm) ?? "";
        byKey.set(id, {
          bidNtceNo: no,
          bidNtceOrd: ord,
          bidNtceNm: name,
          srvceDivNm: s(it.srvceDivNm),
          cntrctCnclsMthdNm: s(it.cntrctCnclsMthdNm),
          ntceInsttNm: s(it.ntceInsttNm),
          dminsttNm: s(it.dminsttNm),
          bidNtceDt: parseG2bDateTime(it.bidNtceDt),
          bidClseDt: parseG2bDateTime(it.bidClseDt),
          opengDt: parseG2bDateTime(it.opengDt),
          presmptPrce: s(it.presmptPrce),
          asignBdgtAmt: s(it.asignBdgtAmt),
          bidNtceDtlUrl: s(it.bidNtceDtlUrl),
          matchedKeywords: matchKeywordGroups(name),
          raw: it,
        });
      }
      if (items.length === 0 || page * NUM >= totalCount) break;
      page++;
    }
  }

  return { bids: [...byKey.values()], apiCalls };
}

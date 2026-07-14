import "server-only";

const BASE =
  "http://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoServcPPSSrch";

// 사용하는 필드만 명시하고 나머지는 인덱스 시그니처로 허용(응답은 113개 필드).
export type G2bBidItem = {
  bidNtceNo?: string;
  bidNtceOrd?: string;
  bidNtceNm?: string;
  srvceDivNm?: string;
  cntrctCnclsMthdNm?: string;
  ntceInsttNm?: string;
  dminsttNm?: string;
  bidNtceDt?: string;
  bidClseDt?: string;
  opengDt?: string;
  presmptPrce?: string;
  asignBdgtAmt?: string;
  bidNtceDtlUrl?: string;
  [key: string]: unknown;
};

/** G2B_SERVICE_KEY 존재 여부 — 수집 버튼 활성/비활성 판단용. */
export function isG2bAvailable(): boolean {
  return Boolean(process.env.G2B_SERVICE_KEY);
}

/**
 * 용역 입찰공고 1페이지 조회. keyword는 공고명 부분검색(bidNtceNm).
 * 날짜는 YYYYMMDDHHMM(KST). serviceKey는 hex라 URLSearchParams 인코딩으로 안전.
 */
export async function fetchServcBids(params: {
  keyword: string;
  bgnDt: string;
  endDt: string;
  pageNo?: number;
  numOfRows?: number;
}): Promise<{ items: G2bBidItem[]; totalCount: number }> {
  const key = process.env.G2B_SERVICE_KEY;
  if (!key) throw new Error("G2B_SERVICE_KEY가 설정되지 않았습니다.");

  const qs = new URLSearchParams({
    serviceKey: key,
    pageNo: String(params.pageNo ?? 1),
    numOfRows: String(params.numOfRows ?? 100),
    inqryDiv: "1",
    type: "json",
    inqryBgnDt: params.bgnDt,
    inqryEndDt: params.endDt,
    bidNtceNm: params.keyword,
  });

  const res = await fetch(`${BASE}?${qs.toString()}`, { cache: "no-store" });
  const text = await res.text();

  let json: {
    response?: {
      header?: { resultCode?: string; resultMsg?: string };
      body?: { items?: G2bBidItem[] | G2bBidItem; totalCount?: number | string };
    };
  };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`나라장터 응답 파싱 실패: ${text.slice(0, 120)}`);
  }

  const header = json.response?.header;
  if (header?.resultCode && header.resultCode !== "00") {
    throw new Error(`나라장터 오류 ${header.resultCode}: ${header.resultMsg ?? ""}`);
  }

  const body = json.response?.body ?? {};
  const rawItems = body.items;
  const items: G2bBidItem[] = Array.isArray(rawItems)
    ? rawItems
    : rawItems
      ? [rawItems]
      : [];
  return { items, totalCount: Number(body.totalCount ?? 0) };
}

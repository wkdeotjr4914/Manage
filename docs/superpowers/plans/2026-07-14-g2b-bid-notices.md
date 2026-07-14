# 나라장터 입찰공고 수집 (용역 · AI/AX 필터) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 나라장터 REST OpenAPI로 용역 입찰공고를 회사 키워드(AI·AX·데이터·챗봇)로 수집해 DB에 저장하고 `/bids`에서 목록·상세로 조회한다(수동 수집 MVP).

**Architecture:** 순수 상수 모듈(키워드 SSOT) → `server-only` API 클라이언트(fetch+URLSearchParams) → 수집·정규화·dedup 서비스 → 서버 액션(Zod+getScope+upsert, 상태 보존) → App Router 페이지 + 클라이언트 워크벤치. 기존 프로젝트 컨벤션(ActionResult, force-dynamic, 한국어 UI)을 그대로 따른다.

**Tech Stack:** Next.js 16(App Router) · React 19 · Prisma 7(driver adapter, `dc_pms` 스키마) · Zod · lucide-react · Tailwind.

## Global Constraints

- **모든 사용자 대면 문자열은 한국어** (UI·에러·주석 포함).
- **테스트 러너 없음** — 각 태스크 검증 게이트는 `npx tsc --noEmit`(빠른 타입체크) + 필요 시 임시 `.mjs` 프로브(실행 후 삭제) + 브라우저 확인. `npm run build`도 유효하나 느리므로 최종 1회.
- **Prisma 클라이언트는 `@/generated/prisma/client`에서 import** (`@prisma/client` 아님).
- **스키마 워크플로우는 push 기반**: `npm run db:push` → `npm run db:generate`. 마이그레이션 디렉터리 없음.
- **`src/server/db.ts`/DB 연결 변경이나 `db:generate` 후에는 dev 서버 전체 재시작** (Prisma 클라이언트가 `globalThis`에 캐시됨 — HMR로는 갱신 안 됨).
- **모든 쿼리·뮤테이션은 `getScope()` 경유** (인증 seam). `workspaceId`는 현재 null.
- **서버 전용 모듈(API 클라이언트·수집)은 `import "server-only"` 선언.**
- **React 순수성 lint**: render 중 `new Date()`/`Date.now()` 금지 — 모듈 스코프 헬퍼만 사용.
- **날짜/키워드 인코딩**: 나라장터 날짜는 `YYYYMMDDHHMM`(KST). 한글 키워드는 UTF-8 percent-encoding 필수 → `URLSearchParams` 사용. serviceKey는 64자 hex라 재인코딩 무관.
- **API 한도**: 요청당 최대 ~15일, 개발계정 1,000회/일. UI 기간 최대 15일로 제한.
- **인증키 env**: `.env`의 `G2B_SERVICE_KEY`(이미 설정됨).

**엔드포인트(실측 확정):**
`http://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoServcPPSSrch`
파라미터: `serviceKey, pageNo, numOfRows, inqryDiv=1, type=json, inqryBgnDt, inqryEndDt, bidNtceNm`.

---

## File Structure

| 파일 | 책임 | 태스크 |
|---|---|---|
| `prisma/schema.prisma` (수정) | `BidNotice` 모델 + `BidStatus` enum | 1 |
| `src/lib/g2b.ts` (신규) | 키워드 그룹 SSOT + 매칭/펼치기 헬퍼 (순수 상수, 클라·서버 공용) | 2 |
| `src/lib/utils.ts` (수정) | `parseG2bDateTime`, `formatDateTime` 헬퍼 | 2 |
| `src/server/g2b/client.ts` (신규) | 나라장터 용역 API 1페이지 호출 (`server-only`) | 3 |
| `src/server/g2b/collect.ts` (신규) | 키워드별 호출·페이지네이션·dedup·정규화 (`server-only`) | 4 |
| `src/server/actions/bids.ts` (신규) | `collectBids`, `setBidStatus` 서버 액션 | 5 |
| `src/app/bids/page.tsx` (신규) | 목록 서버 페이지(force-dynamic) | 6 |
| `src/components/bids/BidWorkbench.tsx` (신규) | 수집 버튼·필터·테이블·상태 토글 (클라이언트) | 6 |
| `src/components/shell/Sidebar.tsx` (수정) | NAV에 "입찰공고" 추가 | 7 |

---

## Task 1: BidNotice 스키마 + DB push

**Files:**
- Modify: `prisma/schema.prisma` (파일 끝에 enum + model 추가)

**Interfaces:**
- Consumes: 없음
- Produces: `prisma.bidNotice` 모델 (`@/generated/prisma/client`). 논리 유일키
  `bidNtceNo_bidNtceOrd`(복합 unique의 Prisma where 이름). enum `BidStatus = NEW|INTERESTED|EXCLUDED`.

- [ ] **Step 1: 스키마에 enum + 모델 추가**

`prisma/schema.prisma` 맨 끝에 다음을 추가:

```prisma
// ----------------------------------------------------------------------------
// 입찰(Bid) 도메인 — 나라장터에서 수집한 용역 입찰공고 (독립 도메인)
// (bidNtceNo, bidNtceOrd) 조합이 논리적 유일키. 재수집은 upsert로 중복 방지하되
// 사용자가 지정한 status/memo는 보존한다.
// ----------------------------------------------------------------------------
enum BidStatus {
  NEW        // 신규 수집
  INTERESTED // 관심
  EXCLUDED   // 제외
}

model BidNotice {
  id                String    @id @default(cuid())

  bidNtceNo         String                  // 공고번호
  bidNtceOrd        String    @default("000")// 공고차수 (실측 3자리 문자열)
  bidNtceNm         String                  // 공고명
  srvceDivNm        String?                 // 용역구분명
  cntrctCnclsMthdNm String?                 // 계약체결방법 (제한경쟁 등)

  ntceInsttNm       String?                 // 공고기관명
  dminsttNm         String?                 // 수요기관명

  bidNtceDt         DateTime?               // 공고일시
  bidClseDt         DateTime?               // 입찰마감일시
  opengDt           DateTime?               // 개찰일시

  presmptPrce       String?                 // 추정가격(원본 문자열)
  asignBdgtAmt      String?                 // 배정예산금액(원본 문자열)

  bidNtceDtlUrl     String?                 // 나라장터 상세 URL

  matchedKeywords   String[]                // 매칭된 회사 키워드 그룹 라벨
  status            BidStatus @default(NEW)
  memo              String?                 // 사내 메모

  raw               Json?                   // 원본 응답 아이템(디버깅/필드 보강용)

  collectedAt       DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  workspaceId       String?

  @@unique([bidNtceNo, bidNtceOrd])
  @@index([status])
  @@index([bidClseDt])
  @@index([bidNtceDt])
}
```

- [ ] **Step 2: DB에 push**

Run: `npm run db:push`
Expected: `dc_pms` 스키마에 `BidNotice` 테이블·`BidStatus` enum 생성, "Your database is now in sync" 류 메시지. **`String[]`(Postgres 배열)이 생성되는지 확인** — 성공하면 OK.

폴백(만약 배열 타입 push 실패 시): `matchedKeywords String[]`를 `matchedKeywords String @default("")`(콤마 구분 문자열)로 바꾸고, 이후 태스크에서 `.split(",")`/`.join(",")`로 처리. **push가 성공하면 이 폴백은 무시.**

- [ ] **Step 3: Prisma 클라이언트 재생성**

Run: `npm run db:generate`
Expected: `src/generated/prisma`에 재생성, 에러 없음.

- [ ] **Step 4: 타입 인식 확인**

Run: `node -e "const{PrismaClient}=require('./src/generated/prisma/client');console.log(typeof new PrismaClient().bidNotice)"`
Expected: `object` (모델이 클라이언트에 존재).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(bids): BidNotice 모델·BidStatus enum 추가 및 DB push"
```

---

## Task 2: 키워드 SSOT + 날짜 헬퍼

**Files:**
- Create: `src/lib/g2b.ts`
- Modify: `src/lib/utils.ts` (파일 끝에 헬퍼 2개 추가)

**Interfaces:**
- Consumes: 없음
- Produces:
  - `BID_KEYWORD_GROUPS: { key: string; label: string; terms: string[] }[]`
  - `matchKeywordGroups(bidNtceNm: string): string[]` — 공고명에 걸리는 그룹 **라벨** 배열
  - `termsForGroups(groupKeys?: string[]): string[]` — 선택 그룹들의 검색어(중복제거), 미지정 시 전체
  - `parseG2bDateTime(value: string | null | undefined): Date | null` — "YYYY-MM-DD HH:MM:SS"(KST)→Date
  - `formatDateTime(date: Date | string | null | undefined): string` — "YYYY.MM.DD HH:mm"(KST)

- [ ] **Step 1: `src/lib/g2b.ts` 생성**

```ts
// 나라장터 입찰공고 회사 키워드 그룹 — 단일 출처(SSOT). 순수 상수라 클라/서버 공용.
export type BidKeywordGroup = {
  key: string;
  label: string;
  terms: string[];
};

export const BID_KEYWORD_GROUPS: BidKeywordGroup[] = [
  { key: "ai", label: "AI·인공지능", terms: ["AI", "인공지능", "머신러닝", "딥러닝", "LLM", "생성형"] },
  { key: "ax", label: "AX·DX", terms: ["AX", "DX", "디지털전환", "지능형", "자동화", "RPA"] },
  { key: "data", label: "데이터", terms: ["데이터", "빅데이터", "데이터레이크", "분석플랫폼"] },
  { key: "chatbot", label: "챗봇·NLP", terms: ["챗봇", "상담", "대화형", "자연어", "음성인식"] },
];

/** 공고명에 포함된 term이 있는 그룹의 label 배열을 반환. */
export function matchKeywordGroups(bidNtceNm: string): string[] {
  const name = bidNtceNm ?? "";
  const matched: string[] = [];
  for (const g of BID_KEYWORD_GROUPS) {
    if (g.terms.some((t) => name.includes(t))) matched.push(g.label);
  }
  return matched;
}

/** 선택한 그룹 key들의 모든 검색어를 펼쳐 중복 제거. groupKeys 미지정/빈배열이면 전체. */
export function termsForGroups(groupKeys?: string[]): string[] {
  const groups = groupKeys?.length
    ? BID_KEYWORD_GROUPS.filter((g) => groupKeys.includes(g.key))
    : BID_KEYWORD_GROUPS;
  return [...new Set(groups.flatMap((g) => g.terms))];
}
```

- [ ] **Step 2: `src/lib/utils.ts` 끝에 날짜 헬퍼 추가**

파일 맨 끝(`todayDateInput` 함수 뒤)에 추가:

```ts
/**
 * 나라장터 응답의 "YYYY-MM-DD HH:MM:SS"(KST) 문자열을 Date로 파싱. 초는 선택.
 * 형식이 어긋나거나 비면 null. 모듈 스코프라 render 밖(서버 수집)에서만 호출.
 */
export function parseG2bDateTime(value: string | null | undefined): Date | null {
  const v = value?.trim();
  if (!v) return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const dt = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s ?? "00"}+09:00`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Date를 KST 기준 "YYYY.MM.DD HH:mm"로 표시. 값이 없으면 빈 문자열. */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  const k = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${k.getUTCFullYear()}.${String(k.getUTCMonth() + 1).padStart(2, "0")}.${String(
    k.getUTCDate(),
  ).padStart(2, "0")} ${String(k.getUTCHours()).padStart(2, "0")}:${String(
    k.getUTCMinutes(),
  ).padStart(2, "0")}`;
}
```

- [ ] **Step 3: 순수 함수 동작 검증(임시 프로브)**

`scripts/_g2b_probe.mjs` 생성:

```js
import { parseG2bDateTime, formatDateTime } from "../src/lib/utils.ts";
```

이 방식은 `.ts` 직접 import가 안 되므로 대신 **로직 동치 확인**을 위해 아래 인라인 검증을 사용:

Run:
```bash
node -e '
const dt = new Date("2026-06-29T07:03:22+09:00");
const k = new Date(dt.getTime()+9*3600*1000);
const out = `${k.getUTCFullYear()}.${String(k.getUTCMonth()+1).padStart(2,"0")}.${String(k.getUTCDate()).padStart(2,"0")} ${String(k.getUTCHours()).padStart(2,"0")}:${String(k.getUTCMinutes()).padStart(2,"0")}`;
console.log(out);
'
```
Expected: `2026.06.29 07:03` (KST 표시 정확). 로직 확인 후 별도 파일 생성 없음.

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 5: Commit**

```bash
git add src/lib/g2b.ts src/lib/utils.ts
git commit -m "feat(bids): 키워드 SSOT와 KST DateTime 파싱/표시 헬퍼 추가"
```

---

## Task 3: 나라장터 API 클라이언트

**Files:**
- Create: `src/server/g2b/client.ts`

**Interfaces:**
- Consumes: `process.env.G2B_SERVICE_KEY`
- Produces:
  - `type G2bBidItem` — 응답 아이템(사용 필드 명시 + 인덱스 시그니처)
  - `isG2bAvailable(): boolean`
  - `fetchServcBids(params: { keyword: string; bgnDt: string; endDt: string; pageNo?: number; numOfRows?: number }): Promise<{ items: G2bBidItem[]; totalCount: number }>`

- [ ] **Step 1: `src/server/g2b/client.ts` 생성**

```ts
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
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음. (실제 HTTP 동작은 이미 대화 중 프로브로 검증됨 — resultCode "00", 필드 실재 확인. `server-only`라 node 단독 실행 불가하므로 통합 검증은 Task 6 브라우저에서.)

- [ ] **Step 3: Commit**

```bash
git add src/server/g2b/client.ts
git commit -m "feat(bids): 나라장터 용역 입찰공고 API 클라이언트"
```

---

## Task 4: 수집·정규화 서비스

**Files:**
- Create: `src/server/g2b/collect.ts`

**Interfaces:**
- Consumes: `fetchServcBids`, `G2bBidItem` (Task 3) · `termsForGroups`, `matchKeywordGroups` (Task 2) · `parseG2bDateTime` (Task 2)
- Produces:
  - `type CollectedBid` — DB 저장 직전 정규화된 공고(Date·null 처리 완료)
  - `type CollectResult = { bids: CollectedBid[]; apiCalls: number }`
  - `collectServcBids(opts: { days: number; groupKeys?: string[]; now?: Date }): Promise<CollectResult>`

- [ ] **Step 1: `src/server/g2b/collect.ts` 생성**

```ts
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
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: Commit**

```bash
git add src/server/g2b/collect.ts
git commit -m "feat(bids): 키워드별 수집·페이지네이션·dedup 서비스"
```

---

## Task 5: 서버 액션 (collectBids, setBidStatus)

**Files:**
- Create: `src/server/actions/bids.ts`

**Interfaces:**
- Consumes: `collectServcBids` (Task 4) · `prisma.bidNotice` (Task 1) · `getScope` · `ActionResult` (`@/server/actions/notes`)
- Produces:
  - `collectBids(input: unknown): Promise<ActionResult<{ fetched: number; created: number; updated: number; apiCalls: number }>>`
  - `setBidStatus(input: unknown): Promise<ActionResult>`

- [ ] **Step 1: `src/server/actions/bids.ts` 생성**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db";
import { getScope } from "@/server/auth";
import { collectServcBids } from "@/server/g2b/collect";
import type { ActionResult } from "./notes";

const collectSchema = z.object({
  days: z.number().int().min(1).max(15).default(7),
  groupKeys: z.array(z.string()).optional(),
});

export async function collectBids(
  input: unknown,
): Promise<
  ActionResult<{ fetched: number; created: number; updated: number; apiCalls: number }>
> {
  const parsed = collectSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  const scope = await getScope();

  let result;
  try {
    result = await collectServcBids({
      days: parsed.data.days,
      groupKeys: parsed.data.groupKeys,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "수집에 실패했습니다." };
  }

  // 기존 레코드 키 집합을 미리 구해 created/updated를 분류.
  const existing = await prisma.bidNotice.findMany({
    where: {
      OR: result.bids.map((b) => ({
        bidNtceNo: b.bidNtceNo,
        bidNtceOrd: b.bidNtceOrd,
      })),
    },
    select: { bidNtceNo: true, bidNtceOrd: true },
  });
  const existingSet = new Set(existing.map((r) => `${r.bidNtceNo}:${r.bidNtceOrd}`));

  let created = 0;
  let updated = 0;
  for (const b of result.bids) {
    // update 절에 status/memo를 넣지 않아 사용자 지정 상태가 재수집으로 초기화되지 않음.
    const common = {
      bidNtceNm: b.bidNtceNm,
      srvceDivNm: b.srvceDivNm,
      cntrctCnclsMthdNm: b.cntrctCnclsMthdNm,
      ntceInsttNm: b.ntceInsttNm,
      dminsttNm: b.dminsttNm,
      bidNtceDt: b.bidNtceDt,
      bidClseDt: b.bidClseDt,
      opengDt: b.opengDt,
      presmptPrce: b.presmptPrce,
      asignBdgtAmt: b.asignBdgtAmt,
      bidNtceDtlUrl: b.bidNtceDtlUrl,
      matchedKeywords: b.matchedKeywords,
      // Prisma Json 입력: G2bBidItem은 인덱스시그니처라 캐스팅 필요.
      raw: b.raw as unknown as object,
    };
    await prisma.bidNotice.upsert({
      where: {
        bidNtceNo_bidNtceOrd: { bidNtceNo: b.bidNtceNo, bidNtceOrd: b.bidNtceOrd },
      },
      create: { ...common, bidNtceNo: b.bidNtceNo, bidNtceOrd: b.bidNtceOrd, workspaceId: scope.workspaceId },
      update: common,
    });
    if (existingSet.has(`${b.bidNtceNo}:${b.bidNtceOrd}`)) updated++;
    else created++;
  }

  revalidatePath("/bids");
  return {
    ok: true,
    data: { fetched: result.bids.length, created, updated, apiCalls: result.apiCalls },
  };
}

const statusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["NEW", "INTERESTED", "EXCLUDED"]),
});

export async function setBidStatus(input: unknown): Promise<ActionResult> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  await prisma.bidNotice.update({
    where: { id: parsed.data.id },
    data: { status: parsed.data.status },
  });
  revalidatePath("/bids");
  return { ok: true };
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음. (`raw` Json 입력 타입 에러가 나면 `b.raw as unknown as object` 캐스팅 확인.)

- [ ] **Step 3: Commit**

```bash
git add src/server/actions/bids.ts
git commit -m "feat(bids): 수집/상태변경 서버 액션 (상태 보존 upsert)"
```

---

## Task 6: 목록 페이지 + 클라이언트 워크벤치

**Files:**
- Create: `src/app/bids/page.tsx`
- Create: `src/components/bids/BidWorkbench.tsx`

**Interfaces:**
- Consumes: `prisma.bidNotice` (Task 1) · `isG2bAvailable` (Task 3) · `collectBids`, `setBidStatus` (Task 5) · `BID_KEYWORD_GROUPS` (Task 2) · `formatDateTime`, `formatDate` (utils) · UI: `Button`, `Select`, `Label` (`@/components/ui/field`, `@/components/ui/button`), `Badge` (`@/components/ui/badge`), `PageHeader` (`@/components/shell/PageHeader`)
- Produces: `/bids` 라우트 화면. `type BidRow`(직렬화된 공고 행) — 서버→클라이언트 전달용.

- [ ] **Step 1: `src/app/bids/page.tsx` 생성**

Date/Json은 클라이언트 컴포넌트로 직접 넘기지 않고 직렬화 가능한 형태로 변환한다.

```tsx
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/shell/PageHeader";
import { BidWorkbench, type BidRow } from "@/components/bids/BidWorkbench";
import { isG2bAvailable } from "@/server/g2b/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "입찰공고 · Second Brain" };

export default async function BidsPage() {
  const bids = await prisma.bidNotice.findMany({
    orderBy: [{ bidClseDt: "asc" }, { collectedAt: "desc" }],
  });

  const rows: BidRow[] = bids.map((b) => ({
    id: b.id,
    bidNtceNo: b.bidNtceNo,
    bidNtceOrd: b.bidNtceOrd,
    bidNtceNm: b.bidNtceNm,
    srvceDivNm: b.srvceDivNm,
    cntrctCnclsMthdNm: b.cntrctCnclsMthdNm,
    ntceInsttNm: b.ntceInsttNm,
    dminsttNm: b.dminsttNm,
    bidNtceDt: b.bidNtceDt ? b.bidNtceDt.toISOString() : null,
    bidClseDt: b.bidClseDt ? b.bidClseDt.toISOString() : null,
    presmptPrce: b.presmptPrce,
    asignBdgtAmt: b.asignBdgtAmt,
    bidNtceDtlUrl: b.bidNtceDtlUrl,
    matchedKeywords: b.matchedKeywords,
    status: b.status,
  }));

  return (
    <div>
      <PageHeader
        title="입찰공고"
        description="나라장터 용역 입찰공고를 회사 키워드로 수집·선별합니다."
      />
      <BidWorkbench rows={rows} available={isG2bAvailable()} />
    </div>
  );
}
```

- [ ] **Step 2: `src/components/bids/BidWorkbench.tsx` 생성**

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import {
  RefreshCw,
  Loader2,
  ExternalLink,
  Star,
  Ban,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, Label } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { cn, formatDateTime } from "@/lib/utils";
import { BID_KEYWORD_GROUPS } from "@/lib/g2b";
import { collectBids, setBidStatus } from "@/server/actions/bids";

export type BidRow = {
  id: string;
  bidNtceNo: string;
  bidNtceOrd: string;
  bidNtceNm: string;
  srvceDivNm: string | null;
  cntrctCnclsMthdNm: string | null;
  ntceInsttNm: string | null;
  dminsttNm: string | null;
  bidNtceDt: string | null;
  bidClseDt: string | null;
  presmptPrce: string | null;
  asignBdgtAmt: string | null;
  bidNtceDtlUrl: string | null;
  matchedKeywords: string[];
  status: "NEW" | "INTERESTED" | "EXCLUDED";
};

const STATUS_META: Record<BidRow["status"], { label: string; color: string }> = {
  NEW: { label: "신규", color: "#38bdf8" },
  INTERESTED: { label: "관심", color: "#f59e0b" },
  EXCLUDED: { label: "제외", color: "#94a3b8" },
};

// 원본 금액 문자열을 천단위 콤마로. 숫자가 아니면 원본 그대로.
function formatMoney(v: string | null): string {
  if (!v) return "-";
  const n = Number(v);
  return Number.isFinite(n) ? `${n.toLocaleString("ko-KR")}원` : v;
}

export function BidWorkbench({
  rows,
  available,
}: {
  rows: BidRow[];
  available: boolean;
}) {
  const [collecting, startCollect] = useTransition();
  const [, startStatus] = useTransition();

  const [days, setDays] = useState("7");
  const [groupSel, setGroupSel] = useState<Record<string, boolean>>(
    Object.fromEntries(BID_KEYWORD_GROUPS.map((g) => [g.key, true])),
  );
  const [statusFilter, setStatusFilter] = useState<"active" | "all" | "INTERESTED">("active");
  const [orgFilter, setOrgFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function runCollect() {
    setError(null);
    setNotice(null);
    const groupKeys = BID_KEYWORD_GROUPS.map((g) => g.key).filter((k) => groupSel[k]);
    if (!groupKeys.length) {
      setError("키워드 그룹을 하나 이상 선택하세요.");
      return;
    }
    startCollect(async () => {
      const res = await collectBids({ days: Number(days), groupKeys });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const d = res.data!;
      setNotice(
        `수집 완료 — 신규 ${d.created} · 갱신 ${d.updated} (총 ${d.fetched}건, API ${d.apiCalls}회)`,
      );
    });
  }

  function changeStatus(id: string, status: BidRow["status"]) {
    startStatus(async () => {
      await setBidStatus({ id, status });
    });
  }

  const filtered = useMemo(() => {
    const org = orgFilter.trim();
    return rows.filter((r) => {
      if (statusFilter === "active" && r.status === "EXCLUDED") return false;
      if (statusFilter === "INTERESTED" && r.status !== "INTERESTED") return false;
      if (org && !(r.ntceInsttNm ?? "").includes(org) && !(r.dminsttNm ?? "").includes(org))
        return false;
      return true;
    });
  }, [rows, statusFilter, orgFilter]);

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* 수집 컨트롤 */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-2 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <Label>수집 기간</Label>
            <Select value={days} onChange={(e) => setDays(e.target.value)}>
              <option value="3">최근 3일</option>
              <option value="7">최근 7일</option>
              <option value="15">최근 15일</option>
            </Select>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {BID_KEYWORD_GROUPS.map((g) => (
              <label key={g.key} className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={groupSel[g.key] ?? false}
                  onChange={(e) => setGroupSel((s) => ({ ...s, [g.key]: e.target.checked }))}
                  className="size-4 rounded border-border"
                />
                {g.label}
              </label>
            ))}
          </div>
          <Button onClick={runCollect} disabled={collecting || !available}>
            {collecting ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            지금 가져오기
          </Button>
        </div>
        {!available && (
          <p className="text-[11px] text-muted-2">
            수집은 G2B_SERVICE_KEY 설정 시 켜집니다.
          </p>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        {notice && <p className="text-sm text-success">{notice}</p>}
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label>상태</Label>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
            <option value="active">진행중(제외 숨김)</option>
            <option value="INTERESTED">관심만</option>
            <option value="all">전체</option>
          </Select>
        </div>
        <div className="min-w-48">
          <Label>기관 검색</Label>
          <input
            value={orgFilter}
            onChange={(e) => setOrgFilter(e.target.value)}
            placeholder="공고/수요기관명"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          />
        </div>
        <span className="ml-auto text-xs text-muted-2">{filtered.length}건</span>
      </div>

      {/* 목록 */}
      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface-2/40 p-8 text-center text-sm text-muted-2">
          표시할 공고가 없습니다. 위에서 “지금 가져오기”를 눌러 수집하세요.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs text-muted-2">
              <tr>
                <th className="px-3 py-2 font-medium">공고명</th>
                <th className="px-3 py-2 font-medium">수요기관</th>
                <th className="px-3 py-2 font-medium">마감</th>
                <th className="px-3 py-2 font-medium">추정가격</th>
                <th className="px-3 py-2 font-medium">키워드</th>
                <th className="px-3 py-2 font-medium">상태</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const closed = r.bidClseDt ? new Date(r.bidClseDt).getTime() < Date.now() : false;
                return (
                  <tr key={r.id} className={cn("border-t border-border", closed && "opacity-50")}>
                    <td className="max-w-md px-3 py-2">
                      <a
                        href={r.bidNtceDtlUrl ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-start gap-1 font-medium text-foreground hover:text-primary"
                      >
                        <span className="line-clamp-2">{r.bidNtceNm}</span>
                        {r.bidNtceDtlUrl && <ExternalLink className="mt-0.5 size-3 shrink-0 text-muted-2" />}
                      </a>
                      <div className="text-[11px] text-muted-2">{r.bidNtceNo}</div>
                    </td>
                    <td className="px-3 py-2 text-muted">{r.dminsttNm ?? r.ntceInsttNm ?? "-"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted">{formatDateTime(r.bidClseDt)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted">{formatMoney(r.presmptPrce)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {r.matchedKeywords.map((k) => (
                          <Badge key={k} color="#a78bfa">{k}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <Badge color={STATUS_META[r.status].color}>{STATUS_META[r.status].label}</Badge>
                        <button
                          onClick={() => changeStatus(r.id, "INTERESTED")}
                          className="rounded p-1 text-muted-2 hover:text-warning"
                          aria-label="관심"
                          title="관심"
                        >
                          <Star className="size-3.5" />
                        </button>
                        <button
                          onClick={() => changeStatus(r.id, "EXCLUDED")}
                          className="rounded p-1 text-muted-2 hover:text-danger"
                          aria-label="제외"
                          title="제외"
                        >
                          <Ban className="size-3.5" />
                        </button>
                        <button
                          onClick={() => changeStatus(r.id, "NEW")}
                          className="rounded p-1 text-muted-2 hover:text-foreground"
                          aria-label="초기화"
                          title="신규로"
                        >
                          <RotateCcw className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

주의: `new Date(r.bidClseDt).getTime() < Date.now()`는 **클라이언트 이벤트/렌더 계산**이다. 이 프로젝트의 순수성 lint는 컴포넌트 함수 본문 최상위의 `Date.now()`를 문제 삼는다. `closed`는 `map` 콜백(렌더 중 실행) 안에 있으므로, lint 경고가 뜨면 `closed` 계산을 제거하고 `opacity` 강조를 생략하거나, 마감여부를 서버(page.tsx)에서 계산해 `BidRow`에 `closed: boolean`으로 내려서 회피한다. **먼저 이대로 작성하고 Step 4 lint에서 확인.**

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 4: lint 확인(순수성)**

Run: `npm run lint`
Expected: 신규 파일에 대한 `Date.now()`/`new Date()` 순수성 에러가 없어야 함. (기존 pre-existing 경고는 무시.) 만약 `BidWorkbench.tsx`의 `closed` 계산에서 순수성 에러가 나면 위 주석대로 서버 계산(`closed: boolean`)으로 이전:
  - `page.tsx`의 `rows` 매핑에 `closed: b.bidClseDt ? b.bidClseDt.getTime() < Date.now() : false` 추가(서버라 허용),
  - `BidRow`에 `closed: boolean` 추가,
  - `BidWorkbench`에서 `const closed = r.closed;`로 대체.

- [ ] **Step 5: Commit**

```bash
git add src/app/bids/page.tsx src/components/bids/BidWorkbench.tsx
git commit -m "feat(bids): /bids 목록·수집·상태관리 UI"
```

---

## Task 7: 사이드바 메뉴 + 통합 검증

**Files:**
- Modify: `src/components/shell/Sidebar.tsx` (import 1줄 + NAV 1항목)

**Interfaces:**
- Consumes: `/bids` 라우트 (Task 6)
- Produces: 좌측 사이드바 "입찰공고" 링크

- [ ] **Step 1: Sidebar에 메뉴 추가**

`src/components/shell/Sidebar.tsx`의 lucide import에 `Gavel`을 추가:

```tsx
import {
  LayoutDashboard,
  Network,
  StickyNote,
  Tags,
  FolderKanban,
  Upload,
  Gavel,
  Brain,
} from "lucide-react";
```

`NAV` 배열의 `/import` 항목 다음 줄에 추가:

```tsx
  { href: "/bids", label: "입찰공고", icon: Gavel },
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: dev 서버 재시작 후 통합 검증**

Task 1에서 `db:generate`를 돌렸으므로 dev 서버를 **전체 재시작**한다(Prisma 클라이언트 globalThis 캐시).

1. dev 서버 재시작: 실행 중인 `npm run dev` 종료 후 `npm run dev`.
2. 브라우저에서 `http://localhost:3000/bids` 접속 → 사이드바 "입찰공고" 활성, 빈 목록 안내 표시.
3. 키워드 그룹 전체 체크 + 기간 "최근 7일" → **"지금 가져오기"** 클릭.
4. Expected: "수집 완료 — 신규 N · 갱신 M …" 안내, 목록에 용역 공고가 마감일 오름차순으로 표시, 각 행에 매칭 키워드 배지·상세 링크.
5. 한 행의 **관심(★)** 클릭 → 상태 "관심"으로 변경. **"지금 가져오기"** 재실행 후에도 그 행이 "관심" 유지되는지 확인(상태 보존).
6. `read_console_messages`로 하이드레이션 에러 없음 확인(패턴 `hydrat|mismatch|Error`).

- [ ] **Step 4: 전체 빌드 게이트**

Run: `npm run build`
Expected: 빌드 성공(기존 pre-existing lint 부채가 있으면 그 파일에 한함 — 신규 코드는 무결해야 함).

- [ ] **Step 5: Commit**

```bash
git add src/components/shell/Sidebar.tsx
git commit -m "feat(bids): 사이드바 입찰공고 메뉴 추가"
```

---

## Self-Review 체크리스트 (계획 작성자 수행 완료)

- **스펙 커버리지**: 데이터모델(T1)·키워드SSOT(T2)·API클라(T3)·수집(T4)·서버액션 상태보존(T5)·UI목록/상세/수집/상태(T6)·사이드바(T7)·serviceKey인코딩(T3 주석/Global)·15일·1000회한도(Global+T5 clamp)·KST날짜(T2)·String[]폴백(T1) 모두 태스크에 매핑됨.
- **플레이스홀더**: 없음(모든 스텝에 실제 코드/명령/기대결과 포함).
- **타입 일관성**: `fetchServcBids`↔`collectServcBids`↔`collectBids` 반환형, `BidRow`(page↔workbench), `where: { bidNtceNo_bidNtceOrd }` 복합 unique 이름 일치 확인.
- **테스트 러너 부재 반영**: 각 태스크 게이트를 tsc/lint/브라우저로 정의.

## 열려있는 확장(이번 범위 밖, 후속 계획)
- Vercel Cron 자동 수집(수집 로직 재사용).
- 관심 공고 → PMS 프로젝트 전환.
- 제외어(EXCLUDE_TERMS) 정제, 물품/공사/외자 업종 오퍼레이션 추가.

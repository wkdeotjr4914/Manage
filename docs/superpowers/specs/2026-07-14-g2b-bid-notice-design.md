# 설계서: 나라장터 입찰공고 수집 (용역 · AI/AX 맞춤 필터)

- 작성일: 2026-07-14
- 상태: 승인 대기 (설계)
- 관련 도메인: 신규 `Bid`(입찰) 도메인 — 기존 Knowledge/PMS와 별개, 같은 워크스페이스 스코프 공유

## 1. 목표

공공데이터포털(data.go.kr)의 **조달청 나라장터 입찰공고정보서비스** REST OpenAPI를
호출해, **용역(서비스) 업종** 입찰공고 중 우리 회사와 관련된(AI·AX·데이터·챗봇 계열
키워드) 공고만 선별해 DB에 저장하고 `/bids` 화면에서 목록·상세로 조회한다.

## 2. 범위

### 2.1 이번 MVP에 포함
- 화면의 **"지금 가져오기" 버튼**으로 최근 N일(기본 7일) 용역 공고 수집(수동 트리거).
- 회사 키워드로 서버측 공고명 검색 → 결과 병합 → 공고번호+차수로 중복 제거 → DB upsert.
- `/bids` 목록(필터·정렬) + 공고 상세(원본 링크 포함).
- 공고 상태 관리: `NEW` / `INTERESTED`(관심) / `EXCLUDED`(제외).
- 좌측 사이드바에 "입찰공고" 메뉴 추가.

### 2.2 이번에는 제외 (향후 확장)
- 자동 주기 수집(Vercel Cron) — 수집 로직은 재사용 가능하게 분리해 두되 스케줄러는 안 붙임.
- 관심 공고 → PMS 프로젝트 전환.
- 물품/공사/외자 업종(오퍼레이션만 추가하면 확장 가능하도록 구조화).
- 알림(이메일/슬랙).

## 3. 데이터 모델 (Prisma, `dc_pms` 스키마)

기존 컨벤션(cuid id, nullable `workspaceId`, `@@index`)을 따른다. 스키마는 push 워크플로우
(`npm run db:push` → `npm run db:generate`).

```prisma
enum BidStatus {
  NEW        // 신규 수집
  INTERESTED // 관심
  EXCLUDED   // 제외
}

/// 나라장터에서 수집한 입찰공고. (bidNtceNo, bidNtceOrd) 조합이 논리적 유일키.
model BidNotice {
  id          String    @id @default(cuid())

  bidNtceNo   String                  // 공고번호
  bidNtceOrd  String    @default("000")// 공고차수 (3자리 문자열, 실측 "000")
  bidNtceNm   String                  // 공고명
  srvceDivNm  String?                 // 용역구분명 (실측 필드)
  cntrctCnclsMthdNm String?           // 계약체결방법 (제한경쟁 등, 실측 필드)

  ntceInsttNm String?                // 공고기관명
  dminsttNm   String?                // 수요기관명

  bidNtceDt   DateTime?              // 공고일시
  bidClseDt   DateTime?              // 입찰마감일시
  opengDt     DateTime?              // 개찰일시 (있으면)

  // 금액은 원본 문자열 그대로 저장(정밀도/직렬화 안전). 표시 시 숫자 포맷.
  presmptPrce   String?              // 추정가격
  asignBdgtAmt  String?              // 배정예산금액

  bidNtceDtlUrl String?              // 나라장터 원본 상세 URL

  matchedKeywords String[]           // 매칭된 회사 키워드 (예: ["AI","데이터"])
  status          BidStatus @default(NEW)
  memo            String?            // 사내 메모(선택)

  raw         Json?                  // 원본 응답 아이템(감사/디버깅용, 선택)

  collectedAt DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  workspaceId String?                // getScope 패턴 (지금은 null)

  @@unique([bidNtceNo, bidNtceOrd])
  @@index([status])
  @@index([bidClseDt])
  @@index([bidNtceDt])
}
```

설계 근거:
- **금액을 `String?`으로 저장**: Prisma `BigInt`는 서버→클라이언트 컴포넌트 직렬화가 까다롭고
  원본이 문자열이므로, 원본 그대로 저장하고 표시 시 `Number` 포맷팅한다.
- `matchedKeywords String[]`: 한 공고가 여러 키워드에 걸릴 수 있어 배열. Postgres 배열 지원.
- `raw Json?`: 필드 스펙이 오퍼레이션마다 조금씩 달라 원본을 남겨 두면 추후 필드 보강이 쉽다.
  용량이 부담되면 이후 제거 가능(선택 필드).

## 4. 키워드 SSOT — `src/lib/g2b.ts`

기존 `validation.ts`/`theme.ts`가 enum의 단일 출처인 것처럼, 키워드 그룹의 단일 출처를 둔다.
`server-only`이 아니라 순수 상수 모듈(클라이언트 필터 UI에서도 라벨 재사용).

```ts
export const BID_KEYWORD_GROUPS = [
  { key: "ai",      label: "AI·인공지능", terms: ["AI", "인공지능", "머신러닝", "딥러닝", "LLM", "생성형"] },
  { key: "ax",      label: "AX·DX",       terms: ["AX", "DX", "디지털전환", "지능형", "자동화", "RPA"] },
  { key: "data",    label: "데이터",       terms: ["데이터", "빅데이터", "데이터레이크", "분석플랫폼"] },
  { key: "chatbot", label: "챗봇·NLP",     terms: ["챗봇", "상담", "대화형", "자연어", "음성인식"] },
] as const;
```

- API의 공고명 검색(`bidNtceNm`)은 단일 검색어만 받으므로, **`terms`를 펼쳐 각 검색어마다 호출**한다.
- 매칭 판정: 저장 전 공고명에 대해 어떤 그룹의 term이 포함됐는지 계산해 `matchedKeywords`(그룹 라벨 기준)에 기록.
- 오탐 완화용 **제외어**(예: "데이터센터 공사", "청소")는 이후 필요 시 `EXCLUDE_TERMS` 상수로 추가.

## 5. 나라장터 API 클라이언트 — `src/server/g2b/client.ts` (`server-only`)

- 오퍼레이션: **`getBidPblancListInfoServcPPSSrch`** (용역 + 공고명 검색 지원 버전).
- Base: `http://apis.data.go.kr/1230000/ad/BidPublicInfoService`.
- 파라미터: `serviceKey`, `pageNo`, `numOfRows`(최대 999), `inqryDiv=1`(공고게시일 기준),
  `inqryBgnDt`/`inqryEndDt`(`YYYYMMDDHHMM`), `type=json`, `bidNtceNm`(검색어).
- **serviceKey 이중 인코딩 함정**: `.env`의 `G2B_SERVICE_KEY`가 Encoding 키인지 Decoding 키인지에
  따라 처리가 갈린다. 안전 원칙 — **Decoding(원문) 키를 `.env`에 넣고, URL 조립 시
  `URLSearchParams`로 자동 인코딩**한다. (Encoding 키를 그대로 쓰면 라이브러리가 재인코딩해
  `%2B`→`%252B`가 되어 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR` 발생.) 구현 시 실제 `.env` 값으로
  1건 호출해 검증한다.
- 응답 파싱: `response.header.resultCode`(정상 `00`)를 먼저 확인, 실패 시 메시지를 담아 throw.
  `response.body.totalCount`로 페이지네이션(다음 페이지 반복). `items`가 단건일 때 배열/객체
  혼재 가능성 방어.
- 함수 시그니처(초안):
  ```ts
  fetchServcBids(params: {
    keyword: string; bgnDt: string; endDt: string; pageNo?: number; numOfRows?: number;
  }): Promise<{ items: G2bBidItem[]; totalCount: number }>;
  ```
- `isG2bAvailable()`: `G2B_SERVICE_KEY` 존재 여부(가져오기 버튼 활성/비활성 판단; import의 `isAiAvailable` 패턴).

## 6. 수집 서비스 — `src/server/g2b/collect.ts` (`server-only`)

- `collectServcBids(opts: { days: number; groupKeys?: string[] })`:
  1. 기간 계산: `endDt = 지금`, `bgnDt = days일 전`. **한 요청 최대 ~15일** 제한이 있으므로
     15일 초과 시 구간 분할(초기 기본 7일이라 분할은 거의 없음, 그래도 로직은 방어).
  2. 선택된 그룹들의 모든 `terms`에 대해 `fetchServcBids` 호출(페이지 전부 순회).
  3. 결과를 `(bidNtceNo, bidNtceOrd)`로 dedup. 각 공고의 공고명으로 매칭 그룹 라벨 재계산.
  4. 정규화된 배열 반환(파싱된 DateTime/문자열 금액 포함). **DB 접근은 하지 않음**(순수 수집).
- 호출량 로그: `키워드 N개 × 페이지 M회 = 총 K회` 형태로 반환 메타에 포함(1,000회/일 한도 인지용).

## 7. 서버 액션 — `src/server/actions/bids.ts` (`"use server"`)

기존 액션 규약(Zod 검증, `ActionResult<T>`, `getScope`, `revalidatePath`)을 따른다.

- `collectBids(input: { days: number; groupKeys?: string[] })`:
  - `collectServcBids` 호출 → 각 공고를 `prisma.bidNotice.upsert`(`where: { bidNtceNo_bidNtceOrd }`).
  - **upsert 정책**: 신규는 `status: NEW`로 생성. 기존 레코드는 공고 필드만 갱신하고
    **사용자가 지정한 `status`/`memo`는 보존**(관심/제외 표시가 재수집으로 초기화되지 않도록).
  - 반환: `{ fetched, created, updated, apiCalls }`. `revalidatePath("/bids")`.
- `setBidStatus(input: { id: string; status: BidStatus })`: 관심/제외 토글. `revalidatePath("/bids")`.
- (선택) `setBidMemo(input: { id, memo })`.

## 8. UI (App Router, `export const dynamic = "force-dynamic"`, 한국어)

- **`/bids` 목록** (`src/app/bids/page.tsx` + `src/components/bids/BidWorkbench.tsx` 클라이언트):
  - 상단: "지금 가져오기" 버튼(기간 선택 기본 7일, 키워드 그룹 체크박스), `isG2bAvailable`가
    false면 비활성 + "G2B_SERVICE_KEY 설정 시 켜집니다" 안내(import UI 패턴 재사용).
  - 필터: 키워드 그룹 / 기관명 검색 / 상태(전체·관심·제외 숨김) / 마감 임박순.
  - 목록 테이블: 공고명(원본 링크) · 수요기관 · 공고일 · **마감일(임박 강조)** · 추정가격 ·
    매칭 키워드 배지 · 상태 토글(관심/제외).
  - 마감 지난 공고는 흐리게. 정렬 기본 = 마감일 오름차순.
- **상세**: 1차는 목록 행 확장(아코디언)으로 전체 필드 + 원본 링크 노출. 별도 라우트
  `/bids/[id]`는 필요 시 추가(YAGNI — MVP는 확장 행으로 충분).
- **사이드바**: `src/components/shell/Sidebar.tsx`의 `NAV` 배열에
  `{ href: "/bids", label: "입찰공고", icon: Gavel }` 추가(lucide `Gavel` 또는 `FileSearch`).

## 9. 날짜 처리 — `src/lib/utils.ts`에 헬퍼 추가

- 기존 `parseDateInput`은 **date-only(정오 UTC 고정)**라 시각이 있는 공고일/마감일에는 부적합.
- 신규 `parseG2bDateTime(s: string): Date | null`: `"2026-07-14 10:00:00"`(KST 가정)을
  `new Date("2026-07-14T10:00:00+09:00")`로 파싱. **모듈 스코프 함수라서 render 밖에서만
  호출**(React 순수성 lint 준수 — 서버 액션/수집 경로에서만 사용).
- 목록 표시엔 시각까지 필요하므로 `formatDateTime` 헬퍼도 추가(예: `2026.07.14 10:00`).

## 10. 환경변수

- `.env`에 **`G2B_SERVICE_KEY`** 추가(사용자 보유 키; Decoding 키 권장 — 5절 참고).
- Vercel 환경변수에도 동일 키 등록해야 배포 환경에서 동작(향후 자동수집 시 필수).

## 11. 한도·리스크

| 항목 | 내용 | 완화 |
|---|---|---|
| 일 호출 한도 | 개발계정 1,000회/일 | 수동 트리거 + 기본 7일 + 호출수 반환/로그 |
| 요청 기간 제한 | 요청당 ~15일 | 15일 초과 시 구간 분할 |
| serviceKey 인코딩 | 이중 인코딩 시 인증 실패 | Decoding 키 + URLSearchParams, 1건 검증 |
| 키워드 오탐 | "데이터센터 공사" 등 | 제외어 상수(후속), 제외 상태로 수동 정리 |
| `bidNtceNm` 미지원 우려 | 기본 오퍼레이션에선 불확실 | `~PPSSrch` 오퍼레이션 사용으로 회피 |

## 12. 파일 요약 (신규/수정)

신규:
- `prisma/schema.prisma` (모델·enum 추가)
- `src/lib/g2b.ts` (키워드 SSOT + 타입)
- `src/server/g2b/client.ts` (API 호출)
- `src/server/g2b/collect.ts` (수집·정규화)
- `src/server/actions/bids.ts` (서버 액션)
- `src/app/bids/page.tsx`, `src/components/bids/BidWorkbench.tsx` (+ 필요 시 행 컴포넌트)

수정:
- `src/lib/utils.ts` (`parseG2bDateTime`, `formatDateTime`)
- `src/components/shell/Sidebar.tsx` (NAV 항목)
- `.env` / Vercel 환경변수 (`G2B_SERVICE_KEY`)

## 13. 검증 계획

- `.env`에 실제 키를 넣고 서버 액션으로 1회 수집 → 인증/파싱/upsert 정상 확인.
- `npx tsc --noEmit`로 타입 검증, `/bids` 브라우저 확인(라이트/다크, 콘솔 하이드레이션).
- 재수집 시 관심/제외 상태 보존 확인(dedup·upsert 정책).
- 스키마 push 시 `String[]`(Postgres 배열) 타입이 EDB에서 생성되는지 확인(실패 시 콤마 문자열 폴백).

## 14. API 실측 검증 결과 (2026-07-14, 사용자 키로 실호출)

- **엔드포인트/키/JSON 응답 정상**: `resultCode "00"`. 용역 오퍼레이션
  `getBidPblancListInfoServcPPSSrch`, `/ad/` 경로, `type=json` 모두 확정.
- **필드 확정**: 응답 아이템 113개 필드. 사용 필드 실재 확인 — `bidNtceNo`,
  `bidNtceOrd`("000"), `bidNtceNm`, `ntceInsttNm`, `dminsttNm`, `bidNtceDt`
  ("2026-06-29 07:03:22" KST), `bidClseDt`, `opengDt`, `presmptPrce`/`asignBdgtAmt`(문자열),
  **`bidNtceDtlUrl`**(나라장터 상세 링크), `srvceDivNm`, `cntrctCnclsMthdNm`, `rgstDt`.
- **키워드 서버검색 유효**(최근 15일 용역): AI 274 · 인공지능 24 · 데이터 154 · 빅데이터 17 ·
  플랫폼 136 · 자동화 12 · 챗봇 2 · 디지털전환 1 · 머신러닝 0. 키워드 없이는 totalCount 7,713.
- **인코딩 결론**: 이 키는 64자 hex라 이중 인코딩 무관. **한글 키워드는 반드시 UTF-8
  percent-encoding**으로 보내야 함(`fetch` + `URLSearchParams`가 정확히 처리). curl을 Windows
  콘솔에서 쓸 때 한글 인자가 깨져 0건이 나온 것은 셸 문제이지 API 문제가 아님 — 구현은 fetch 사용.
- **페이지네이션 필수**: 키워드별 totalCount가 numOfRows(999)를 넘을 수 있어 다음 페이지 순회.
- **정제 필요 실증**: 한 공고가 여러 키워드에 걸림(dedup+`matchedKeywords` 타당) / "자동화"에
  차량 임차 등 오탐 존재(EXCLUDED 상태 관리 타당).

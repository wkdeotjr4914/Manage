"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  RefreshCw,
  Loader2,
  ExternalLink,
  Heart,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, Label } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { cn, daysAgo, formatDateTime } from "@/lib/utils";
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
  fitScore: number | null;
  fitReason: string | null;
  fitRecommend: boolean | null;
  closed: boolean;
};

type SortKey = "fitScore" | "bidNtceNm" | "org" | "bidClseDt" | "presmptPrce";
type SortDir = "asc" | "desc";

// 그리드 컬럼 정의. key가 있으면 헤더 클릭 정렬 가능.
const COLUMNS: { key: SortKey | null; label: string; className?: string }[] = [
  { key: "fitScore", label: "적합도", className: "whitespace-nowrap" },
  { key: "bidNtceNm", label: "공고명" },
  { key: "org", label: "수요기관" },
  { key: "bidClseDt", label: "마감", className: "whitespace-nowrap" },
  { key: "presmptPrce", label: "추정가격", className: "whitespace-nowrap" },
  { key: null, label: "키워드" },
  { key: null, label: "관심" },
];

// 적합도 점수 → 색상·라벨. 강(≥70) 초록 · 중(40~69) 노랑 · 약(<40) 회색.
function fitTone(score: number): { color: string; label: string } {
  if (score >= 70) return { color: "#22c55e", label: "강" };
  if (score >= 40) return { color: "#eab308", label: "중" };
  return { color: "#94a3b8", label: "약" };
}

// 원본 금액 문자열을 천단위 콤마로. 숫자가 아니면 원본 그대로.
function formatMoney(v: string | null): string {
  if (!v) return "-";
  const n = Number(v);
  return Number.isFinite(n) && v.trim() !== "" ? `${n.toLocaleString("ko-KR")}원` : v;
}

function sortValue(r: BidRow, key: SortKey): string | number {
  switch (key) {
    case "fitScore":
      return r.fitScore ?? -1; // 미판정(-1)은 정렬 시 맨 아래로
    case "bidNtceNm":
      return r.bidNtceNm ?? "";
    case "org":
      return r.dminsttNm ?? r.ntceInsttNm ?? "";
    case "bidClseDt":
      return r.bidClseDt ?? ""; // ISO 문자열이라 사전식 정렬 = 시간순 정렬
    case "presmptPrce":
      return Number(r.presmptPrce ?? "0") || 0;
  }
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
  const [view, setView] = useState<"active" | "liked">("active");
  const [search, setSearch] = useState("");
  // 목록 필터(수집 컨트롤과 별개) — 화면에 표시된 공고만 걸러낸다.
  const [catFilter, setCatFilter] = useState<Record<string, boolean>>({});
  const [periodFilter, setPeriodFilter] = useState("all");
  const [minScore, setMinScore] = useState("all"); // 적합도 하한 필터
  // 기본 정렬은 적합도 높은 순 — 회사 특성에 맞는 공고를 위로 올린다.
  const [sortKey, setSortKey] = useState<SortKey>("fitScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const likedCount = useMemo(
    () => rows.filter((r) => r.status === "INTERESTED").length,
    [rows],
  );

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
        `수집 완료 — 신규 ${d.created} · 갱신 ${d.updated} · 적합도 분석 ${d.scored}건 ` +
          `(총 ${d.fetched}건, API ${d.apiCalls}회)`,
      );
    });
  }

  function toggleLike(r: BidRow) {
    const next = r.status === "INTERESTED" ? "NEW" : "INTERESTED";
    startStatus(async () => {
      await setBidStatus({ id: r.id, status: next });
    });
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const rowsView = useMemo(() => {
    const q = search.trim();
    // 선택된 카테고리 → label 집합. 비어 있으면 카테고리 필터 미적용(전체).
    const selectedLabels = new Set(
      BID_KEYWORD_GROUPS.filter((g) => catFilter[g.key]).map((g) => g.label),
    );
    // 기간 필터 컷오프(epoch ms). "all"이면 미적용. daysAgo로 render purity 유지.
    const cutoff =
      periodFilter === "all" ? null : daysAgo(Number(periodFilter)).getTime();
    const minScoreN = minScore === "all" ? null : Number(minScore);
    const list = rows.filter((r) => {
      // 뷰별 기본 필터: 진행 중은 마감/제외 숨김, 관심은 관심 등록만(마감 무관).
      if (view === "liked") {
        if (r.status !== "INTERESTED") return false;
      } else {
        if (r.closed) return false;
        if (r.status === "EXCLUDED") return false;
      }
      // 적합도 하한 필터: 지정 점수 미만이거나 미판정(null)이면 제외.
      if (minScoreN !== null) {
        if (r.fitScore === null || r.fitScore < minScoreN) return false;
      }
      // 카테고리 필터: 선택된 카테고리 중 하나라도 매칭(OR)되어야 통과.
      if (selectedLabels.size > 0) {
        if (!r.matchedKeywords.some((k) => selectedLabels.has(k))) return false;
      }
      // 기간 필터: 공고일(bidNtceDt)이 컷오프 이후여야 통과. 값 없으면 제외.
      if (cutoff !== null) {
        const t = r.bidNtceDt ? new Date(r.bidNtceDt).getTime() : NaN;
        if (Number.isNaN(t) || t < cutoff) return false;
      }
      // 공고명·기관명 통합 검색.
      if (q) {
        const hay = `${r.bidNtceNm} ${r.ntceInsttNm ?? ""} ${r.dminsttNm ?? ""}`;
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const dir = sortDir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), "ko") * dir;
    });
  }, [rows, view, search, catFilter, periodFilter, minScore, sortKey, sortDir]);

  const tabBase =
    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors";
  const tabActive = "bg-primary/20 text-foreground ring-1 ring-primary/30";
  const tabIdle = "text-muted hover:text-foreground";

  const chipBase =
    "rounded-full border px-3 py-1 text-xs font-medium transition-colors";
  const chipActive = "border-primary/40 bg-primary/20 text-foreground";
  const chipIdle = "border-border text-muted hover:border-primary/30 hover:text-foreground";

  const filterActive =
    Object.values(catFilter).some(Boolean) ||
    periodFilter !== "all" ||
    minScore !== "all" ||
    search.trim() !== "";

  function resetFilters() {
    setCatFilter({});
    setPeriodFilter("all");
    setMinScore("all");
    setSearch("");
  }

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
              <label
                key={g.key}
                className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
              >
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
            {collecting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            지금 가져오기
          </Button>
          <Link
            href="/settings/company"
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted transition-colors hover:text-foreground"
          >
            <SlidersHorizontal className="size-4" />
            적합도 기준 편집
          </Link>
        </div>
        <p className="text-[11px] text-muted-2">
          수집 시 회사 프로필 기준으로 AI가 각 공고의 적합도(0~100)를 자동 분석합니다.
        </p>
        {!available && (
          <p className="text-[11px] text-muted-2">수집은 G2B_SERVICE_KEY 설정 시 켜집니다.</p>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        {notice && <p className="text-sm text-success">{notice}</p>}
      </div>

      {/* 뷰 탭 + 목록 필터(카테고리·기간·키워드) */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg border border-border bg-surface-2 p-0.5">
            <button onClick={() => setView("active")} className={cn(tabBase, view === "active" ? tabActive : tabIdle)}>
              진행 중
            </button>
            <button onClick={() => setView("liked")} className={cn(tabBase, view === "liked" ? tabActive : tabIdle)}>
              <Heart className={cn("size-3.5", view === "liked" && "fill-current text-danger")} /> 관심 {likedCount}
            </button>
          </div>
          <Select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
            className="w-auto"
            aria-label="기간 필터"
          >
            <option value="all">전체 기간</option>
            <option value="3">최근 3일</option>
            <option value="7">최근 7일</option>
            <option value="15">최근 15일</option>
          </Select>
          <Select
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
            className="w-auto"
            aria-label="적합도 필터"
          >
            <option value="all">적합도 전체</option>
            <option value="70">추천 (70+)</option>
            <option value="40">관련 (40+)</option>
          </Select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="공고명·기관명 키워드 검색"
            className="min-w-56 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm sm:max-w-xs"
          />
          <span className="ml-auto text-xs text-muted-2">{rowsView.length}건</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {BID_KEYWORD_GROUPS.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => setCatFilter((s) => ({ ...s, [g.key]: !s[g.key] }))}
              className={cn(chipBase, catFilter[g.key] ? chipActive : chipIdle)}
            >
              {g.label}
            </button>
          ))}
          {filterActive && (
            <button
              type="button"
              onClick={resetFilters}
              className="ml-1 text-xs text-muted-2 underline-offset-2 hover:text-foreground hover:underline"
            >
              필터 초기화
            </button>
          )}
        </div>
      </div>

      {/* 데이터 그리드 */}
      {rowsView.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface-2/40 p-8 text-center text-sm text-muted-2">
          {filterActive
            ? "필터 조건과 일치하는 공고가 없습니다. 필터를 조정하거나 초기화하세요."
            : view === "liked"
              ? "관심 등록한 공고가 없습니다. 하트를 눌러 관심에 추가하세요."
              : "표시할 공고가 없습니다. 위에서 “지금 가져오기”를 눌러 수집하세요."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs text-muted-2">
              <tr>
                {COLUMNS.map((col) => (
                  <th key={col.label} className={cn("px-3 py-2 font-medium", col.className)}>
                    {col.key ? (
                      <button
                        onClick={() => toggleSort(col.key!)}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        {col.label}
                        {sortKey === col.key ? (
                          sortDir === "asc" ? (
                            <ArrowUp className="size-3" />
                          ) : (
                            <ArrowDown className="size-3" />
                          )
                        ) : (
                          <ChevronsUpDown className="size-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowsView.map((r) => (
                <tr key={r.id} className={cn("border-t border-border", r.closed && "opacity-50")}>
                  <td className="whitespace-nowrap px-3 py-2">
                    {r.fitScore === null ? (
                      <span className="text-xs text-muted-2" title="아직 분석되지 않음">
                        미분석
                      </span>
                    ) : (
                      (() => {
                        const tone = fitTone(r.fitScore);
                        return (
                          <span
                            className="inline-flex items-center gap-1.5"
                            title={r.fitReason ?? undefined}
                          >
                            <Badge color={tone.color}>
                              {tone.label} {r.fitScore}
                            </Badge>
                          </span>
                        );
                      })()
                    )}
                  </td>
                  <td className="max-w-md px-3 py-2">
                    <a
                      href={r.bidNtceDtlUrl ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-start gap-1 font-medium text-foreground hover:text-primary"
                    >
                      <span className="line-clamp-2">{r.bidNtceNm}</span>
                      {r.bidNtceDtlUrl && (
                        <ExternalLink className="mt-0.5 size-3 shrink-0 text-muted-2" />
                      )}
                    </a>
                    <div className="text-[11px] text-muted-2">{r.bidNtceNo}</div>
                  </td>
                  <td className="px-3 py-2 text-muted">{r.dminsttNm ?? r.ntceInsttNm ?? "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted">
                    {formatDateTime(r.bidClseDt)}
                    {r.closed && (
                      <Badge className="ml-1.5 !py-0 !text-[10px]">마감</Badge>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted">
                    {formatMoney(r.presmptPrce)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {r.matchedKeywords.map((k) => (
                        <Badge key={k} color="#a78bfa">
                          {k}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => toggleLike(r)}
                      className="rounded p-1"
                      aria-label={r.status === "INTERESTED" ? "관심 해제" : "관심 등록"}
                      title={r.status === "INTERESTED" ? "관심 해제" : "관심 등록"}
                    >
                      <Heart
                        className={cn(
                          "size-4.5 transition-colors",
                          r.status === "INTERESTED"
                            ? "fill-current text-danger"
                            : "text-muted-2 hover:text-danger",
                        )}
                      />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

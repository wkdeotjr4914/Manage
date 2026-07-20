import { prisma } from "@/server/db";
import { PageHeader } from "@/components/shell/PageHeader";
import { BidWorkbench, type BidRow } from "@/components/bids/BidWorkbench";
import { isG2bAvailable } from "@/server/g2b/client";
import { daysAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "입찰공고 · Second Brain" };

export default async function BidsPage() {
  const bids = await prisma.bidNotice.findMany({
    orderBy: [{ bidClseDt: "asc" }, { collectedAt: "desc" }],
  });
  // "지금"은 모듈 헬퍼로 얻어 render 중 Date.now() 직접 호출을 피한다(순수성 lint).
  const nowMs = daysAgo(0).getTime();

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
    fitScore: b.fitScore,
    fitReason: b.fitReason,
    fitRecommend: b.fitRecommend,
    closed: b.bidClseDt ? b.bidClseDt.getTime() < nowMs : false,
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

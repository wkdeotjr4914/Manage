"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db";
import { getScope } from "@/server/auth";
import { collectServcBids } from "@/server/g2b/collect";
import { assessBidFit, type FitInput, type FitResult } from "@/server/g2b/fit";
import { getCompanyProfile } from "@/server/company/profile";
import { isAiAvailable } from "@/server/import/ai";
import { companyProfileSchema } from "@/lib/validation";
import type { ActionResult } from "./notes";

// 한 번 수집 시 자동 AI 판정할 최대 건수(순차 배치라 시간·토큰을 bound). 초과분은
// 다음 수집이나 재수집 때 처리된다(미판정으로 남음).
const MAX_AUTO_ASSESS = 60;

const collectSchema = z.object({
  days: z.number().int().min(1).max(15).default(7),
  groupKeys: z.array(z.string()).optional(),
});

export async function collectBids(
  input: unknown,
): Promise<
  ActionResult<{
    fetched: number;
    created: number;
    updated: number;
    apiCalls: number;
    scored: number;
  }>
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
  const existing = result.bids.length
    ? await prisma.bidNotice.findMany({
        where: {
          OR: result.bids.map((b) => ({
            bidNtceNo: b.bidNtceNo,
            bidNtceOrd: b.bidNtceOrd,
          })),
        },
        select: { bidNtceNo: true, bidNtceOrd: true },
      })
    : [];
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
      create: {
        ...common,
        bidNtceNo: b.bidNtceNo,
        bidNtceOrd: b.bidNtceOrd,
        workspaceId: scope.workspaceId,
      },
      update: common,
    });
    if (existingSet.has(`${b.bidNtceNo}:${b.bidNtceOrd}`)) updated++;
    else created++;
  }

  // 수집 직후 자동 AI 적합도 판정. 아직 미판정(fitScore == null)인 수집분만 대상으로
  // 하고, MAX_AUTO_ASSESS로 상한을 둔다. 이전 판정·사용자 상태는 건드리지 않는다.
  let scored = 0;
  if (isAiAvailable() && result.bids.length) {
    try {
      scored = await assessCollected(result.bids);
    } catch (e) {
      // 판정 실패는 수집 성공을 무효화하지 않는다(공고는 이미 저장됨).
      console.error("[bids] 자동 적합도 판정 실패:", e instanceof Error ? e.message : e);
    }
  }

  revalidatePath("/bids");
  return {
    ok: true,
    data: {
      fetched: result.bids.length,
      created,
      updated,
      apiCalls: result.apiCalls,
      scored,
    },
  };
}

/**
 * 방금 수집한 공고 중 미판정 건을 AI로 판정해 DB에 반영. 반환은 실제 판정된 건수.
 */
async function assessCollected(
  bids: Awaited<ReturnType<typeof collectServcBids>>["bids"],
): Promise<number> {
  // 수집분 중 fitScore가 아직 없는 것만 추린다(재수집 시 이전 판정 보존).
  const unscored = await prisma.bidNotice.findMany({
    where: {
      fitScore: null,
      OR: bids.map((b) => ({ bidNtceNo: b.bidNtceNo, bidNtceOrd: b.bidNtceOrd })),
    },
    select: { bidNtceNo: true, bidNtceOrd: true },
  });
  const unscoredSet = new Set(unscored.map((r) => `${r.bidNtceNo}:${r.bidNtceOrd}`));
  if (unscoredSet.size === 0) return 0;

  const targets = bids
    .filter((b) => unscoredSet.has(`${b.bidNtceNo}:${b.bidNtceOrd}`))
    .slice(0, MAX_AUTO_ASSESS);

  const inputs: FitInput[] = targets.map((b) => ({
    key: `${b.bidNtceNo}:${b.bidNtceOrd}`,
    bidNtceNm: b.bidNtceNm,
    ntceInsttNm: b.ntceInsttNm,
    dminsttNm: b.dminsttNm,
    cntrctCnclsMthdNm: b.cntrctCnclsMthdNm,
    matchedKeywords: b.matchedKeywords,
  }));

  const profile = await getCompanyProfile();
  const results = await assessBidFit(inputs, profile);
  if (results.size === 0) return 0;

  // 판정 결과를 한 트랜잭션으로 일괄 반영(건별 왕복 N+1 대신). 부분 성공으로
  // 점수가 뒤섞이지 않도록 원자적으로 커밋.
  const now = new Date();
  const ops = targets
    .map((b) => ({ b, fit: results.get(`${b.bidNtceNo}:${b.bidNtceOrd}`) }))
    .filter((x): x is { b: (typeof targets)[number]; fit: FitResult } => Boolean(x.fit))
    .map(({ b, fit }) =>
      prisma.bidNotice.update({
        where: {
          bidNtceNo_bidNtceOrd: { bidNtceNo: b.bidNtceNo, bidNtceOrd: b.bidNtceOrd },
        },
        data: {
          fitScore: fit.fitScore,
          fitReason: fit.fitReason,
          fitRecommend: fit.fitRecommend,
          fitAt: now,
        },
      }),
    );
  if (ops.length === 0) return 0;
  await prisma.$transaction(ops);
  return ops.length;
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

/**
 * 회사 프로필(적합도 판정 기준) 저장. 싱글턴(id="default") upsert. 저장 후의
 * 새 수집부터 이 기준이 적용된다(이미 판정된 공고 점수는 그대로 유지).
 */
export async function saveCompanyProfile(input: unknown): Promise<ActionResult> {
  const parsed = companyProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  const scope = await getScope();
  const d = parsed.data;
  // 빈 서술은 null로 저장 — getCompanyProfile이 기본 프로필로 폴백한다.
  const data = {
    businessArea: d.businessArea || null,
    strengths: d.strengths || null,
    preferred: d.preferred || null,
    avoided: d.avoided || null,
    extraNotes: d.extraNotes || null,
    avoidKeywords: d.avoidKeywords,
    updatedBy: scope.userId,
  };
  await prisma.companyProfile.upsert({
    where: { id: "default" },
    create: { id: "default", ...data },
    update: data,
  });
  revalidatePath("/settings/company");
  revalidatePath("/bids");
  return { ok: true };
}

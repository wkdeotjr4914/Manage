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

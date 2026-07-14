import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/server/db";
import { runAllForUser } from "@/server/google/sync";

export const dynamic = "force-dynamic";
// 서버리스 함수 실행시간 상향(플랜 한도 내). 사용자 수가 많으면 배치로 나눠야 함.
export const maxDuration = 300;

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

// Vercel Cron이 호출하는 공개 엔드포인트. 프록시가 /api를 통과시키므로 세션이
// 아니라 CRON_SECRET Bearer 토큰으로 보호한다(Vercel Cron이 헤더를 자동 주입).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET이 설정되지 않았습니다." }, { status: 500 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const accounts = await prisma.googleAccount.findMany({
    where: { status: "CONNECTED" },
    select: { userId: true },
  });

  // 사용자별 격리 실행 — 한 사용자의 실패가 다른 사용자를 막지 않도록 try/catch.
  const results: Record<string, unknown> = {};
  for (const { userId } of accounts) {
    try {
      results[userId] = await runAllForUser(userId);
    } catch (e) {
      results[userId] = { fatal: e instanceof Error ? e.message : String(e) };
    }
  }

  return NextResponse.json({ ok: true, users: accounts.length, results });
}

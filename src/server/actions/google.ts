"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUser, requireAdmin } from "@/server/auth";
import { buildAuthUrl } from "@/server/google/auth";
import {
  getGoogleOAuthConfig,
  saveGoogleOAuthConfig,
  clearGoogleOAuthConfig,
} from "@/server/google/config";
import { createOAuthState } from "@/server/google/state";
import { disconnectGoogleAccount } from "@/server/google/token";
import {
  runGmailSync,
  runCalendarSync,
  runSheetsSync,
  type GmailSyncResult,
  type CalendarSyncResult,
  type SheetsSyncResult,
} from "@/server/google/sync";
import type { ActionResult } from "./notes";

/**
 * Begin the OAuth connect flow: mint a one-time DB-backed state bound to the
 * user, and return the Google authorization URL for the client to navigate to.
 */
export async function startGoogleConnect(): Promise<ActionResult<{ url: string }>> {
  const user = await requireUser();
  const config = await getGoogleOAuthConfig();
  if (!config) {
    return { ok: false, error: "구글 OAuth 앱이 설정되지 않았습니다. 관리자에게 문의하세요." };
  }

  const state = await createOAuthState(user.id);
  return { ok: true, data: { url: buildAuthUrl(config, state) } };
}

// --- 앱 OAuth 설정(ADMIN 전용) ---------------------------------------------
const clientConfigSchema = z.object({
  clientId: z.string().trim().min(1, "client_id를 입력하세요.").max(500),
  // 저장 화면에서 secret을 다시 입력하지 않으면 기존 값 유지(빈 문자열 허용).
  clientSecret: z.string().trim().max(500).optional().default(""),
  redirectUri: z
    .string()
    .trim()
    .url("redirect_uri는 올바른 URL이어야 합니다.")
    .max(500),
});

export async function saveGoogleClientConfig(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = clientConfigSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  const res = await saveGoogleOAuthConfig(
    {
      clientId: parsed.data.clientId,
      redirectUri: parsed.data.redirectUri,
      clientSecret: parsed.data.clientSecret || undefined,
    },
    admin.id,
  );
  if (!res.ok) return res;
  revalidatePath("/settings/integrations");
  return { ok: true };
}

export async function clearGoogleClientConfig(): Promise<ActionResult> {
  await requireAdmin();
  await clearGoogleOAuthConfig();
  revalidatePath("/settings/integrations");
  return { ok: true };
}

/** Disconnect the current user's Google account (best-effort revoke + delete). */
export async function disconnectGoogle(): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await disconnectGoogleAccount(user.id);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "연결 해제에 실패했습니다.",
    };
  }
  revalidatePath("/settings/integrations");
  return { ok: true };
}

// label은 이제 (Gmail 라벨명이 아니라) 제목·발신자·본문에서 찾을 검색 키워드다.
// 공백(여러 단어 문구)과 @(발신자 이메일/도메인)를 허용하되, runGmailSync가 이 값을
// 따옴표로 감싸 쿼리를 만들므로 콜론·따옴표·괄호 같은 Gmail 연산자 문자는 계속 금지해
// 인젝션을 막는다.
const ruleSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "검색어를 입력하세요.")
    .max(100)
    .regex(
      /^[\w가-힣@.\-/ ]+$/,
      "검색어는 문자·숫자·한글·공백·@-_/. 만 사용할 수 있습니다.",
    ),
  projectId: z.string().trim().optional(),
});

/** 검색어→프로젝트 규칙 추가/갱신(userId+label 유일). 빈 프로젝트 = 연결 안 함. */
export async function addGmailLabelRule(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = ruleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  const acct = await prisma.googleAccount.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!acct) return { ok: false, error: "구글 계정이 연결되어 있지 않습니다." };

  // 존재하는 프로젝트만 허용(없으면 연결 안 함).
  let projectId: string | null = null;
  if (parsed.data.projectId) {
    const p = await prisma.project.findUnique({
      where: { id: parsed.data.projectId },
      select: { id: true },
    });
    projectId = p?.id ?? null;
  }

  await prisma.gmailLabelRule.upsert({
    where: { userId_label: { userId: user.id, label: parsed.data.label } },
    create: { userId: user.id, label: parsed.data.label, projectId },
    update: { projectId },
  });
  revalidatePath("/settings/integrations");
  return { ok: true };
}

export async function removeGmailLabelRule(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = z.object({ id: z.string().min(1) }).safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  // userId 필터로 자기 규칙만 삭제(IDOR 차단).
  const res = await prisma.gmailLabelRule.deleteMany({
    where: { id: parsed.data.id, userId: user.id },
  });
  if (res.count === 0) return { ok: false, error: "규칙을 찾을 수 없습니다." };
  revalidatePath("/settings/integrations");
  return { ok: true };
}

// --- 수동 트리거("지금 실행") ----------------------------------------------
// 항상 requireUser 로 자기 계정만 동기화(IDOR 차단).
export async function syncGmailNow(
  input?: { full?: boolean },
): Promise<ActionResult<GmailSyncResult>> {
  const user = await requireUser();
  try {
    const data = await runGmailSync(user.id, { full: input?.full === true });
    revalidatePath("/settings/integrations");
    revalidatePath("/mails");
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Gmail 수집에 실패했습니다." };
  }
}

export async function syncCalendarNow(): Promise<ActionResult<CalendarSyncResult>> {
  const user = await requireUser();
  try {
    const data = await runCalendarSync(user.id);
    revalidatePath("/settings/integrations");
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "캘린더 동기화에 실패했습니다." };
  }
}

export async function exportSheetsNow(): Promise<ActionResult<SheetsSyncResult>> {
  const user = await requireUser();
  try {
    const data = await runSheetsSync(user.id);
    revalidatePath("/settings/integrations");
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "시트 내보내기에 실패했습니다." };
  }
}

"use server";

// 수집 메일(CollectedMail) 액션 — 상태/메모 변경 및 노트로 변환.
// 메일은 개인 데이터라 모든 쿼리를 requireUser + 자기 userId로 스코프(IDOR 차단).
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth";
import { analyzeImport, commitImport } from "@/server/actions/import";
import type { ActionResult } from "./notes";

const statusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["NEW", "READ", "ARCHIVED"]),
});

export async function setCollectedMailStatus(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  // updateMany + userId 필터: 남의 메일 id를 넣어도 count 0으로 무해하게 실패.
  const res = await prisma.collectedMail.updateMany({
    where: { id: parsed.data.id, userId: user.id },
    data: { status: parsed.data.status },
  });
  if (res.count === 0) return { ok: false, error: "메일을 찾을 수 없습니다." };
  revalidatePath("/mails");
  return { ok: true };
}

const memoSchema = z.object({ id: z.string().min(1), memo: z.string().max(2000) });

export async function setCollectedMailMemo(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = memoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  const res = await prisma.collectedMail.updateMany({
    where: { id: parsed.data.id, userId: user.id },
    data: { memo: parsed.data.memo.trim() || null },
  });
  if (res.count === 0) return { ok: false, error: "메일을 찾을 수 없습니다." };
  revalidatePath("/mails");
  return { ok: true };
}

const convertSchema = z.object({ id: z.string().min(1) });

/** 수집 메일 1건을 기존 import 파이프라인으로 노트화(sourceKey로 멱등). */
export async function convertMailToNote(
  input: unknown,
): Promise<ActionResult<{ noteId: string | null }>> {
  const user = await requireUser();
  const parsed = convertSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  const mail = await prisma.collectedMail.findFirst({
    where: { id: parsed.data.id, userId: user.id },
  });
  if (!mail) return { ok: false, error: "메일을 찾을 수 없습니다." };

  const dateStr = mail.internalDate ? mail.internalDate.toISOString().slice(0, 10) : "";
  const markdown =
    `# ${mail.subject}\n\n` +
    `- 보낸사람: ${mail.fromAddr}\n` +
    (mail.toAddr ? `- 받는사람: ${mail.toAddr}\n` : "") +
    (dateStr ? `- 날짜: ${dateStr}\n` : "") +
    `\n---\n\n${mail.body || mail.snippet || ""}`;

  const analysis = await analyzeImport({
    markdown,
    filename: mail.subject,
    mode: "heuristic",
  });
  if (!analysis.ok) return { ok: false, error: analysis.error };

  const commit = await commitImport({
    plan: analysis.plan,
    sourceKey: `gmail:${mail.messageId}`,
    projectId: mail.projectId ?? undefined,
    skipTasks: !mail.projectId,
  });
  if (!commit.ok) return { ok: false, error: commit.error };

  const noteId = commit.data.firstNoteId;
  await prisma.collectedMail.update({
    where: { id: mail.id },
    data: { noteId, status: mail.status === "NEW" ? "READ" : mail.status },
  });
  revalidatePath("/mails");
  revalidatePath("/notes");
  return { ok: true, data: { noteId } };
}

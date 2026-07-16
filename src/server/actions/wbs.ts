"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { wbsSchema } from "@/lib/validation";
import { parseDateInput, todayDateInput } from "@/lib/utils";
import type { ActionResult } from "./notes";

const seg = (projectId: string) => `/projects/${projectId}/wbs`;

async function nextSortOrder(projectId: string): Promise<number> {
  const last = await prisma.wBSItem.findFirst({
    where: { projectId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  return (last?.sortOrder ?? 0) + 1000;
}

/** Depth is derived from the parent so the tree indent stays consistent. */
async function levelFor(parentId: string | null): Promise<number> {
  if (!parentId) return 1;
  const parent = await prisma.wBSItem.findUnique({
    where: { id: parentId },
    select: { level: true },
  });
  return (parent?.level ?? 0) + 1;
}

export async function createWBSItem(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = wbsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  const d = parsed.data;
  const parentId = d.parentId || null;
  const row = await prisma.wBSItem.create({
    data: {
      projectId: d.projectId,
      parentId,
      level: await levelFor(parentId),
      sortOrder: await nextSortOrder(d.projectId),
      code: d.code || null,
      name: d.name,
      phase: d.phase || null,
      assignee: d.assignee || null,
      priority: d.priority,
      status: d.status,
      progress: d.progress,
      // 시작일을 비우면 데이터 쌓은 시점(오늘)을 디폴트로. 종료일은 입력값 그대로.
      startDate: parseDateInput(d.startDate || todayDateInput()),
      endDate: parseDateInput(d.endDate),
      planStartDate: parseDateInput(d.planStartDate),
      planEndDate: parseDateInput(d.planEndDate),
      description: d.description || null,
    },
    select: { id: true },
  });
  revalidatePath(seg(d.projectId));
  return { ok: true, data: { id: row.id } };
}

export async function updateWBSItem(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = wbsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  const d = parsed.data;
  const parentId = d.parentId && d.parentId !== id ? d.parentId : null;
  await prisma.wBSItem.update({
    where: { id },
    data: {
      parentId,
      level: await levelFor(parentId),
      code: d.code || null,
      name: d.name,
      phase: d.phase || null,
      assignee: d.assignee || null,
      priority: d.priority,
      status: d.status,
      progress: d.progress,
      startDate: parseDateInput(d.startDate),
      endDate: parseDateInput(d.endDate),
      planStartDate: parseDateInput(d.planStartDate),
      planEndDate: parseDateInput(d.planEndDate),
      description: d.description || null,
    },
  });
  revalidatePath(seg(d.projectId));
  return { ok: true };
}

export async function deleteWBSItem(
  id: string,
  projectId: string,
): Promise<ActionResult> {
  await prisma.wBSItem.delete({ where: { id } });
  revalidatePath(seg(projectId));
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { pmsTaskSchema } from "@/lib/validation";
import { parseDateInput } from "@/lib/utils";
import type { ActionResult } from "./notes";

const seg = (projectId: string) => `/projects/${projectId}/tasks`;

async function nextSortOrder(projectId: string): Promise<number> {
  const last = await prisma.pmsTask.findFirst({
    where: { projectId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  return (last?.sortOrder ?? 0) + 1000;
}

export async function createPmsTask(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = pmsTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  const d = parsed.data;
  const row = await prisma.pmsTask.create({
    data: {
      projectId: d.projectId,
      sortOrder: await nextSortOrder(d.projectId),
      code: d.code || null,
      name: d.name,
      phase: d.phase || null,
      assignee: d.assignee || null,
      priority: d.priority,
      status: d.status,
      progress: d.progress,
      startDate: parseDateInput(d.startDate),
      endDate: parseDateInput(d.endDate),
      description: d.description || null,
    },
    select: { id: true },
  });
  revalidatePath(seg(d.projectId));
  return { ok: true, data: { id: row.id } };
}

export async function updatePmsTask(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = pmsTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  const d = parsed.data;
  await prisma.pmsTask.update({
    where: { id },
    data: {
      code: d.code || null,
      name: d.name,
      phase: d.phase || null,
      assignee: d.assignee || null,
      priority: d.priority,
      status: d.status,
      progress: d.progress,
      startDate: parseDateInput(d.startDate),
      endDate: parseDateInput(d.endDate),
      description: d.description || null,
    },
  });
  revalidatePath(seg(d.projectId));
  return { ok: true };
}

export async function deletePmsTask(
  id: string,
  projectId: string,
): Promise<ActionResult> {
  await prisma.pmsTask.delete({ where: { id } });
  revalidatePath(seg(projectId));
  return { ok: true };
}

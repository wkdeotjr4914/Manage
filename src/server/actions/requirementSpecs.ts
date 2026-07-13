"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requirementSpecSchema } from "@/lib/validation";
import { parseDateInput } from "@/lib/utils";
import type { ActionResult } from "./notes";

const seg = (projectId: string) => `/projects/${projectId}/requirements`;

async function nextSortOrder(projectId: string): Promise<number> {
  const last = await prisma.requirementSpec.findFirst({
    where: { projectId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  return (last?.sortOrder ?? 0) + 1000;
}

export async function createRequirementSpec(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = requirementSpecSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  const d = parsed.data;
  const row = await prisma.requirementSpec.create({
    data: {
      projectId: d.projectId,
      sortOrder: await nextSortOrder(d.projectId),
      iaId: d.iaId || null,
      systemType: d.systemType || "선택",
      status: d.status,
      menuPath: d.menuPath || null,
      name: d.name,
      detail: d.detail || null,
      review: d.review || null,
      confirmed: d.confirmed,
      importance: d.importance,
      requester: d.requester || null,
      receiver: d.receiver || null,
      requestDate: parseDateInput(d.requestDate),
      dueDate: parseDateInput(d.dueDate),
      targetDate: parseDateInput(d.targetDate),
      progress: d.progress,
    },
    select: { id: true },
  });
  revalidatePath(seg(d.projectId));
  return { ok: true, data: { id: row.id } };
}

export async function updateRequirementSpec(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = requirementSpecSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  const d = parsed.data;
  await prisma.requirementSpec.update({
    where: { id },
    data: {
      iaId: d.iaId || null,
      systemType: d.systemType || "선택",
      status: d.status,
      menuPath: d.menuPath || null,
      name: d.name,
      detail: d.detail || null,
      review: d.review || null,
      confirmed: d.confirmed,
      importance: d.importance,
      requester: d.requester || null,
      receiver: d.receiver || null,
      requestDate: parseDateInput(d.requestDate),
      dueDate: parseDateInput(d.dueDate),
      targetDate: parseDateInput(d.targetDate),
      progress: d.progress,
    },
  });
  revalidatePath(seg(d.projectId));
  return { ok: true };
}

export async function deleteRequirementSpec(
  id: string,
  projectId: string,
): Promise<ActionResult> {
  await prisma.requirementSpec.delete({ where: { id } });
  revalidatePath(seg(projectId));
  return { ok: true };
}

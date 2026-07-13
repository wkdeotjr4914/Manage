"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requirementSchema } from "@/lib/validation";
import { parseDateInput } from "@/lib/utils";
import type { ActionResult } from "./notes";

const seg = (projectId: string) => `/projects/${projectId}/requirements-def`;

/** Next sort order at the end of the list (mirrors createTask's spacing). */
async function nextSortOrder(projectId: string): Promise<number> {
  const last = await prisma.requirement.findFirst({
    where: { projectId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  return (last?.sortOrder ?? 0) + 1000;
}

export async function createRequirement(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = requirementSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  const d = parsed.data;
  const row = await prisma.requirement.create({
    data: {
      projectId: d.projectId,
      sortOrder: await nextSortOrder(d.projectId),
      category: d.category || "기능",
      classif: d.classif || null,
      rfpNo: d.rfpNo || null,
      subNo: d.subNo || null,
      name: d.name,
      subName: d.subName || null,
      detail: d.detail || null,
      acceptance: d.acceptance || "수용",
      output: d.output || null,
      requestDate: parseDateInput(d.requestDate),
      dueDate: parseDateInput(d.dueDate),
      targetDate: parseDateInput(d.targetDate),
      updatedBy: d.updatedBy || null,
    },
    select: { id: true },
  });
  revalidatePath(seg(d.projectId));
  return { ok: true, data: { id: row.id } };
}

export async function updateRequirement(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = requirementSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  const d = parsed.data;
  await prisma.requirement.update({
    where: { id },
    data: {
      category: d.category || "기능",
      classif: d.classif || null,
      rfpNo: d.rfpNo || null,
      subNo: d.subNo || null,
      name: d.name,
      subName: d.subName || null,
      detail: d.detail || null,
      acceptance: d.acceptance || "수용",
      output: d.output || null,
      requestDate: parseDateInput(d.requestDate),
      dueDate: parseDateInput(d.dueDate),
      targetDate: parseDateInput(d.targetDate),
      updatedBy: d.updatedBy || null,
    },
  });
  revalidatePath(seg(d.projectId));
  return { ok: true };
}

export async function deleteRequirement(
  id: string,
  projectId: string,
): Promise<ActionResult> {
  await prisma.requirement.delete({ where: { id } });
  revalidatePath(seg(projectId));
  return { ok: true };
}

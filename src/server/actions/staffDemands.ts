"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { staffDemandSchema } from "@/lib/validation";
import type { ActionResult } from "./notes";

const seg = (projectId: string) => `/projects/${projectId}/staffing`;

/** Next sort order at the end of the list (mirrors createRequirement's spacing). */
async function nextSortOrder(projectId: string): Promise<number> {
  const last = await prisma.staffDemand.findFirst({
    where: { projectId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  return (last?.sortOrder ?? 0) + 1000;
}

export async function createStaffDemand(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = staffDemandSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  const d = parsed.data;
  const row = await prisma.staffDemand.create({
    data: {
      projectId: d.projectId,
      sortOrder: await nextSortOrder(d.projectId),
      role: d.role,
      grade: d.grade,
      headcount: d.headcount,
      note: d.note || null,
    },
    select: { id: true },
  });
  revalidatePath(seg(d.projectId));
  return { ok: true, data: { id: row.id } };
}

export async function updateStaffDemand(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = staffDemandSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  const d = parsed.data;
  await prisma.staffDemand.update({
    where: { id },
    data: {
      role: d.role,
      grade: d.grade,
      headcount: d.headcount,
      note: d.note || null,
    },
  });
  revalidatePath(seg(d.projectId));
  return { ok: true };
}

export async function deleteStaffDemand(
  id: string,
  projectId: string,
): Promise<ActionResult> {
  await prisma.staffDemand.delete({ where: { id } });
  revalidatePath(seg(projectId));
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { staffMemberSchema } from "@/lib/validation";
import { parseDateInput } from "@/lib/utils";
import type { ActionResult } from "./notes";

const seg = (projectId: string) => `/projects/${projectId}/staffing`;

/** Next sort order at the end of the list (mirrors createRequirement's spacing). */
async function nextSortOrder(projectId: string): Promise<number> {
  const last = await prisma.staffMember.findFirst({
    where: { projectId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  return (last?.sortOrder ?? 0) + 1000;
}

export async function createStaffMember(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = staffMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  const d = parsed.data;
  const row = await prisma.staffMember.create({
    data: {
      projectId: d.projectId,
      sortOrder: await nextSortOrder(d.projectId),
      name: d.name,
      grade: d.grade,
      role: d.role || null,
      company: d.company || null,
      allocation: d.allocation,
      startDate: parseDateInput(d.startDate),
      endDate: parseDateInput(d.endDate),
      contact: d.contact || null,
      note: d.note || null,
    },
    select: { id: true },
  });
  revalidatePath(seg(d.projectId));
  return { ok: true, data: { id: row.id } };
}

export async function updateStaffMember(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = staffMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  const d = parsed.data;
  await prisma.staffMember.update({
    where: { id },
    data: {
      name: d.name,
      grade: d.grade,
      role: d.role || null,
      company: d.company || null,
      allocation: d.allocation,
      startDate: parseDateInput(d.startDate),
      endDate: parseDateInput(d.endDate),
      contact: d.contact || null,
      note: d.note || null,
    },
  });
  revalidatePath(seg(d.projectId));
  return { ok: true };
}

export async function deleteStaffMember(
  id: string,
  projectId: string,
): Promise<ActionResult> {
  await prisma.staffMember.delete({ where: { id } });
  revalidatePath(seg(projectId));
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { deliverableSchema } from "@/lib/validation";
import type { ActionResult } from "./notes";

const seg = (projectId: string) => `/projects/${projectId}/deliverables`;

async function nextSortOrder(projectId: string): Promise<number> {
  const last = await prisma.deliverable.findFirst({
    where: { projectId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  return (last?.sortOrder ?? 0) + 1000;
}

export async function createDeliverable(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = deliverableSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  const d = parsed.data;
  const row = await prisma.deliverable.create({
    data: {
      projectId: d.projectId,
      sortOrder: await nextSortOrder(d.projectId),
      name: d.name,
      description: d.description || null,
      templateFile: d.templateFile || null,
      outputFile: d.outputFile || null,
      outputLink: d.outputLink || null,
    },
    select: { id: true },
  });
  revalidatePath(seg(d.projectId));
  return { ok: true, data: { id: row.id } };
}

export async function updateDeliverable(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = deliverableSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  const d = parsed.data;
  await prisma.deliverable.update({
    where: { id },
    data: {
      name: d.name,
      description: d.description || null,
      templateFile: d.templateFile || null,
      outputFile: d.outputFile || null,
      outputLink: d.outputLink || null,
    },
  });
  revalidatePath(seg(d.projectId));
  return { ok: true };
}

export async function deleteDeliverable(
  id: string,
  projectId: string,
): Promise<ActionResult> {
  await prisma.deliverable.delete({ where: { id } });
  revalidatePath(seg(projectId));
  return { ok: true };
}

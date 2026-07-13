"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { getScope } from "@/server/auth";
import { projectSchema } from "@/lib/validation";
import type { ActionResult } from "./notes";

export async function createProject(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  const scope = await getScope();
  const project = await prisma.project.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description || null,
      color: parsed.data.color || null,
      ownerId: scope.userId,
      workspaceId: scope.workspaceId,
    },
  });
  revalidatePath("/projects");
  revalidatePath("/");
  return { ok: true, data: { id: project.id } };
}

export async function updateProject(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  await prisma.project.update({
    where: { id },
    data: {
      name: parsed.data.name,
      description: parsed.data.description || null,
      color: parsed.data.color || null,
    },
  });
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  return { ok: true };
}

export async function deleteProject(id: string): Promise<ActionResult> {
  await prisma.project.delete({ where: { id } });
  revalidatePath("/projects");
  revalidatePath("/");
  return { ok: true };
}

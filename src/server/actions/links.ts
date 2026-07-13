"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { edgeSchema } from "@/lib/validation";
import type { ActionResult } from "./notes";

/** Create a directed edge between two notes (knowledge graph link). */
export async function createEdge(input: unknown): Promise<ActionResult> {
  const parsed = edgeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  const { sourceId, targetId, type } = parsed.data;

  const existing = await prisma.edge.findUnique({
    where: { sourceId_targetId_type: { sourceId, targetId, type } },
  });
  if (existing) {
    return { ok: false, error: "이미 같은 종류의 연결이 있습니다." };
  }

  await prisma.edge.create({ data: { sourceId, targetId, type } });
  revalidatePath("/graph");
  revalidatePath(`/notes/${sourceId}`);
  revalidatePath(`/notes/${targetId}`);
  return { ok: true };
}

export async function deleteEdge(id: string): Promise<ActionResult> {
  await prisma.edge.delete({ where: { id } });
  revalidatePath("/graph");
  return { ok: true };
}

/** Attach a knowledge note to a project or task (cross-domain link). */
export async function linkNote(input: {
  noteId: string;
  projectId?: string | null;
  taskId?: string | null;
  relation?: string | null;
}): Promise<ActionResult> {
  if (!input.noteId || (!input.projectId && !input.taskId)) {
    return { ok: false, error: "노트와 대상(프로젝트 또는 태스크)을 지정하세요." };
  }
  await prisma.noteLink.create({
    data: {
      noteId: input.noteId,
      projectId: input.projectId || null,
      taskId: input.taskId || null,
      relation: input.relation || null,
    },
  });
  revalidatePath("/projects");
  if (input.projectId) revalidatePath(`/projects/${input.projectId}`);
  revalidatePath(`/notes/${input.noteId}`);
  return { ok: true };
}

export async function unlinkNote(
  id: string,
  projectId?: string,
): Promise<ActionResult> {
  await prisma.noteLink.delete({ where: { id } });
  revalidatePath("/projects");
  if (projectId) revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

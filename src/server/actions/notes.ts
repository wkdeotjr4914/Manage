"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { getScope } from "@/server/auth";
import { noteSchema } from "@/lib/validation";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export async function createNote(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  const { title, content, summary, type, topicId, tagIds } = parsed.data;
  const scope = await getScope();

  const note = await prisma.note.create({
    data: {
      title,
      content: content ?? "",
      summary: summary || null,
      type,
      topicId: topicId || null,
      workspaceId: scope.workspaceId,
      authorId: scope.userId,
      tags: tagIds.length ? { create: tagIds.map((tagId) => ({ tagId })) } : undefined,
    },
  });

  revalidatePath("/notes");
  revalidatePath("/graph");
  revalidatePath("/");
  return { ok: true, data: { id: note.id } };
}

export async function updateNote(
  id: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  const { title, content, summary, type, topicId, tagIds } = parsed.data;

  await prisma.$transaction([
    prisma.noteTag.deleteMany({ where: { noteId: id } }),
    prisma.note.update({
      where: { id },
      data: {
        title,
        content: content ?? "",
        summary: summary || null,
        type,
        topicId: topicId || null,
        tags: tagIds.length ? { create: tagIds.map((tagId) => ({ tagId })) } : undefined,
      },
    }),
  ]);

  revalidatePath("/notes");
  revalidatePath(`/notes/${id}`);
  revalidatePath("/graph");
  revalidatePath("/");
  return { ok: true, data: { id } };
}

export async function deleteNote(id: string): Promise<ActionResult> {
  await prisma.note.delete({ where: { id } });
  revalidatePath("/notes");
  revalidatePath("/graph");
  revalidatePath("/");
  return { ok: true };
}

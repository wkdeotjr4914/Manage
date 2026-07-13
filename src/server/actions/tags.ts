"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { tagSchema, topicSchema } from "@/lib/validation";
import type { ActionResult } from "./notes";

export async function createTag(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = tagSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  const existing = await prisma.tag.findUnique({
    where: { name: parsed.data.name },
  });
  if (existing) return { ok: false, error: "이미 있는 태그입니다." };

  const tag = await prisma.tag.create({
    data: { name: parsed.data.name, color: parsed.data.color || null },
  });
  revalidatePath("/tags");
  return { ok: true, data: { id: tag.id } };
}

export async function deleteTag(id: string): Promise<ActionResult> {
  await prisma.tag.delete({ where: { id } });
  revalidatePath("/tags");
  revalidatePath("/notes");
  return { ok: true };
}

export async function createTopic(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = topicSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  const topic = await prisma.topic.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description || null,
      color: parsed.data.color || null,
    },
  });
  revalidatePath("/tags");
  revalidatePath("/graph");
  return { ok: true, data: { id: topic.id } };
}

export async function deleteTopic(id: string): Promise<ActionResult> {
  await prisma.topic.delete({ where: { id } });
  revalidatePath("/tags");
  revalidatePath("/graph");
  return { ok: true };
}

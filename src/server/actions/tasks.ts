"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { taskSchema, TASK_STATUS_VALUES } from "@/lib/validation";
import type { ActionResult } from "./notes";

export async function createTask(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  const { projectId, title, description, status, priority } = parsed.data;

  // Place new task at the end of its column.
  const last = await prisma.task.findFirst({
    where: { projectId, status },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const order = (last?.order ?? 0) + 1000;

  const task = await prisma.task.create({
    data: {
      projectId,
      title,
      description: description || null,
      status,
      priority,
      order,
    },
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/");
  return { ok: true, data: { id: task.id } };
}

/** Move a task to a (possibly new) column at a client-computed fractional order. */
export async function moveTask(input: {
  taskId: string;
  toStatus: string;
  newOrder: number;
}): Promise<ActionResult> {
  const status = input.toStatus as (typeof TASK_STATUS_VALUES)[number];
  if (!TASK_STATUS_VALUES.includes(status)) {
    return { ok: false, error: "잘못된 상태입니다." };
  }
  const task = await prisma.task.update({
    where: { id: input.taskId },
    data: { status, order: input.newOrder },
    select: { projectId: true },
  });
  revalidatePath(`/projects/${task.projectId}`);
  return { ok: true };
}

export async function updateTask(
  id: string,
  input: {
    title?: string;
    description?: string | null;
    priority?: string;
    assigneeId?: string | null;
    dueDate?: string | null;
  },
): Promise<ActionResult> {
  const task = await prisma.task.update({
    where: { id },
    data: {
      title: input.title,
      description: input.description ?? undefined,
      priority: input.priority as never,
      assigneeId: input.assigneeId ?? undefined,
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
    },
    select: { projectId: true },
  });
  revalidatePath(`/projects/${task.projectId}`);
  return { ok: true };
}

export async function deleteTask(id: string): Promise<ActionResult> {
  const task = await prisma.task.delete({
    where: { id },
    select: { projectId: true },
  });
  revalidatePath(`/projects/${task.projectId}`);
  revalidatePath("/");
  return { ok: true };
}

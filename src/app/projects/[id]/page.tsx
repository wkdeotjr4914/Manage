import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { ProjectNotes } from "@/components/projects/ProjectNotes";
import type { TaskData } from "@/components/kanban/TaskCard";
import type { NodeTypeKey, TaskPriorityKey } from "@/lib/theme";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      tasks: {
        include: {
          assignee: { select: { name: true } },
          _count: { select: { links: true } },
        },
        orderBy: { order: "asc" },
      },
      links: {
        select: {
          id: true,
          relation: true,
          note: { select: { id: true, title: true, type: true } },
        },
      },
    },
  });

  if (!project) notFound();

  const candidates = await prisma.note.findMany({
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });

  const tasks: TaskData[] = project.tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority as TaskPriorityKey,
    order: t.order,
    assignee: t.assignee ? { name: t.assignee.name } : null,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    noteCount: t._count.links,
  }));

  const done = tasks.filter((t) => t.status === "DONE").length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const color = project.color ?? "#7c6cf0";

  return (
    <div>
      <div className="flex flex-col gap-4 px-6 pt-5">
        <div className="flex items-center gap-3">
          <div className="h-1.5 w-48 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full"
              style={{ width: `${pct}%`, backgroundColor: color }}
            />
          </div>
          <span className="text-xs text-muted-2">
            {done}/{tasks.length} 완료 · {pct}%
          </span>
        </div>

        <ProjectNotes
          projectId={id}
          links={project.links.map((l) => ({
            linkId: l.id,
            relation: l.relation,
            note: { ...l.note, type: l.note.type as NodeTypeKey },
          }))}
          candidates={candidates}
        />
      </div>

      <KanbanBoard projectId={id} initialTasks={tasks} />
    </div>
  );
}

import { prisma } from "@/server/db";
import { toDateInputValue } from "@/lib/utils";
import {
  PmsTasksPageClient,
  type PmsTaskItem,
} from "@/components/pms-tasks/PmsTasksPageClient";

export const dynamic = "force-dynamic";

export default async function TasksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rows = await prisma.pmsTask.findMany({
    where: { projectId: id },
    orderBy: { sortOrder: "asc" },
  });
  const items: PmsTaskItem[] = rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    phase: r.phase,
    assignee: r.assignee,
    priority: r.priority,
    status: r.status,
    progress: r.progress,
    startDate: toDateInputValue(r.startDate),
    endDate: toDateInputValue(r.endDate),
    description: r.description,
  }));
  return <PmsTasksPageClient projectId={id} items={items} />;
}

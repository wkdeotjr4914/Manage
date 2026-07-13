import { prisma } from "@/server/db";
import { toDateInputValue } from "@/lib/utils";
import { WbsPageClient, type WBSListItem } from "@/components/wbs/WbsPageClient";

export const dynamic = "force-dynamic";

export default async function WbsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rows = await prisma.wBSItem.findMany({
    where: { projectId: id },
    orderBy: { sortOrder: "asc" },
  });
  const items: WBSListItem[] = rows.map((r) => ({
    id: r.id,
    parentId: r.parentId,
    code: r.code,
    name: r.name,
    level: r.level,
    phase: r.phase,
    assignee: r.assignee,
    priority: r.priority,
    status: r.status,
    progress: r.progress,
    startDate: toDateInputValue(r.startDate),
    endDate: toDateInputValue(r.endDate),
    planStartDate: toDateInputValue(r.planStartDate),
    planEndDate: toDateInputValue(r.planEndDate),
    description: r.description,
  }));
  return <WbsPageClient projectId={id} items={items} />;
}

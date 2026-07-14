import { prisma } from "@/server/db";
import { toDateInputValue } from "@/lib/utils";
import {
  RequirementSpecsPageClient,
  type RequirementSpecItem,
} from "@/components/requirement-specs/RequirementSpecsPageClient";

export const dynamic = "force-dynamic";

export default async function RequirementsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rows = await prisma.requirementSpec.findMany({
    where: { projectId: id },
    orderBy: { sortOrder: "asc" },
  });
  const items: RequirementSpecItem[] = rows.map((r) => ({
    id: r.id,
    iaId: r.iaId,
    systemType: r.systemType,
    status: r.status,
    menuPath: r.menuPath,
    name: r.name,
    detail: r.detail,
    review: r.review,
    confirmed: r.confirmed,
    importance: r.importance,
    requester: r.requester,
    receiver: r.receiver,
    requestDate: toDateInputValue(r.requestDate),
    dueDate: toDateInputValue(r.dueDate),
    targetDate: toDateInputValue(r.targetDate),
    progress: r.progress,
  }));
  return <RequirementSpecsPageClient projectId={id} items={items} />;
}

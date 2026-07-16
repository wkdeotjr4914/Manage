import { prisma } from "@/server/db";
import { toDateInputValue } from "@/lib/utils";
import {
  RequirementsPageClient,
  type RequirementItem,
} from "@/components/requirements/RequirementsPageClient";

export const dynamic = "force-dynamic";

export default async function RequirementsDefPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rows = await prisma.requirement.findMany({
    where: { projectId: id },
    orderBy: { sortOrder: "asc" },
  });
  const items: RequirementItem[] = rows.map((r) => ({
    id: r.id,
    category: r.category,
    classif: r.classif,
    rfpNo: r.rfpNo,
    subNo: r.subNo,
    name: r.name,
    subName: r.subName,
    detail: r.detail,
    acceptance: r.acceptance,
    output: r.output,
    requestDate: toDateInputValue(r.requestDate),
    dueDate: toDateInputValue(r.dueDate),
    targetDate: toDateInputValue(r.targetDate),
    updatedBy: r.updatedBy,
    source: r.source,
  }));
  return <RequirementsPageClient projectId={id} items={items} />;
}

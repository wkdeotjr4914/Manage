import { prisma } from "@/server/db";
import {
  DeliverablesPageClient,
  type DeliverableItem,
} from "@/components/deliverables/DeliverablesPageClient";

export const dynamic = "force-dynamic";

export default async function DeliverablesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rows = await prisma.deliverable.findMany({
    where: { projectId: id },
    orderBy: { sortOrder: "asc" },
  });
  const items: DeliverableItem[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    templateFile: r.templateFile,
    outputFile: r.outputFile,
    outputLink: r.outputLink,
    source: r.source,
  }));
  return <DeliverablesPageClient projectId={id} items={items} />;
}

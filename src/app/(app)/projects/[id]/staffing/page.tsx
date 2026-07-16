import { prisma } from "@/server/db";
import { toDateInputValue } from "@/lib/utils";
import {
  StaffingPageClient,
  type StaffDemandItem,
  type StaffMemberItem,
} from "@/components/staffing/StaffingPageClient";

export const dynamic = "force-dynamic";

export default async function StaffingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [demandRows, memberRows] = await Promise.all([
    prisma.staffDemand.findMany({
      where: { projectId: id },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.staffMember.findMany({
      where: { projectId: id },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const demands: StaffDemandItem[] = demandRows.map((r) => ({
    id: r.id,
    role: r.role,
    grade: r.grade,
    headcount: r.headcount,
    note: r.note,
  }));

  const members: StaffMemberItem[] = memberRows.map((r) => ({
    id: r.id,
    name: r.name,
    grade: r.grade,
    role: r.role,
    company: r.company,
    allocation: r.allocation,
    startDate: toDateInputValue(r.startDate),
    endDate: toDateInputValue(r.endDate),
    contact: r.contact,
    note: r.note,
  }));

  return (
    <StaffingPageClient projectId={id} demands={demands} members={members} />
  );
}

import { prisma } from "@/server/db";
import { PageHeader } from "@/components/shell/PageHeader";
import { ImportWorkbench } from "@/components/import/ImportWorkbench";
import { isAiAvailable } from "@/server/import/ai";

export const dynamic = "force-dynamic";
export const metadata = { title: "가져오기 · Second Brain" };

export default async function ImportPage() {
  const projects = await prisma.project.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: "desc" },
  });
  const aiAvailable = isAiAvailable();

  return (
    <div>
      <PageHeader
        title="가져오기"
        description="회의록·문서 마크다운을 올리면 노트·태스크·연결로 정리합니다."
      />
      <ImportWorkbench aiAvailable={aiAvailable} projects={projects} />
    </div>
  );
}

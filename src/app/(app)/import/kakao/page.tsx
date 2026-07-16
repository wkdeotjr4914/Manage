import { prisma } from "@/server/db";
import { PageHeader } from "@/components/shell/PageHeader";
import { KakaoImportWorkbench } from "@/components/kakao/KakaoImportWorkbench";
import { isAiAvailable } from "@/server/import/ai";

export const dynamic = "force-dynamic";
export const metadata = { title: "카카오톡 가져오기 · Second Brain" };

export default async function KakaoImportPage() {
  const projects = await prisma.project.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="카카오톡 가져오기"
        description="카카오톡 대화 내보내기(.txt)를 올리면 AI가 프로젝트별로 업무·요구사항·노트로 분류해 저장합니다."
      />
      <KakaoImportWorkbench aiAvailable={isAiAvailable()} projects={projects} />
    </div>
  );
}

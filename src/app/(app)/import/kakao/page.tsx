import { prisma } from "@/server/db";
import { PageHeader } from "@/components/shell/PageHeader";
import { KakaoImportWorkbench } from "@/components/kakao/KakaoImportWorkbench";
import { isAiAvailable } from "@/server/import/ai";
import { isHermesProxyAvailable } from "@/server/agent/hermesProxy";

export const dynamic = "force-dynamic";
// 에이전트(Hermes) 경로는 클라이언트가 청크별로 서버 액션을 호출하고, 청크 1건이
// 수십 초~150초 걸릴 수 있다. Vercel Pro에서 함수 시간제한을 넉넉히 둔다(호비면 60초 상한).
export const maxDuration = 300;
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
      <KakaoImportWorkbench
        aiAvailable={isAiAvailable()}
        agentAvailable={isHermesProxyAvailable()}
        projects={projects}
      />
    </div>
  );
}

import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { isAiAvailable } from "@/server/import/ai";
import { isAgentAvailable } from "@/server/agent/discord";
import { PageHeader } from "@/components/shell/PageHeader";
import { MailWorkbench, type MailRow } from "@/components/mails/MailWorkbench";

export const dynamic = "force-dynamic";
export const metadata = { title: "수집 메일 · Second Brain" };

export default async function MailsPage() {
  const user = await requireUser();

  // 메일은 개인 데이터 — 자기 것만 조회.
  const mails = await prisma.collectedMail.findMany({
    where: { userId: user.id },
    orderBy: [{ internalDate: "desc" }, { collectedAt: "desc" }],
    take: 500,
  });

  // 업무 등록 다이얼로그의 프로젝트 선택용 목록(카카오 가져오기 페이지와 동일).
  const projects = await prisma.project.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: "desc" },
  });

  const rows: MailRow[] = mails.map((m) => ({
    id: m.id,
    subject: m.subject,
    fromAddr: m.fromAddr,
    snippet: m.snippet,
    body: m.body,
    internalDate: m.internalDate ? m.internalDate.toISOString() : null,
    status: m.status,
    memo: m.memo,
    noteId: m.noteId,
    projectId: m.projectId,
  }));

  return (
    <div>
      <PageHeader
        title="수집 메일"
        description="Gmail에서 수집한 메일을 확인하고 선별하거나 노트·업무로 등록합니다. (연동 설정은 “연동” 메뉴)"
      />
      <MailWorkbench
        rows={rows}
        projects={projects}
        aiAvailable={isAiAvailable()}
        agentAvailable={isAgentAvailable()}
      />
    </div>
  );
}

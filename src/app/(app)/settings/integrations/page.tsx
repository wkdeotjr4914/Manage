import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { getGoogleOAuthConfigStatus } from "@/server/google/config";
import { PageHeader } from "@/components/shell/PageHeader";
import { GoogleIntegration } from "@/components/settings/GoogleIntegration";

export const dynamic = "force-dynamic";
export const metadata = { title: "연동 · Second Brain" };

export default async function IntegrationsPage() {
  const user = await requireUser();

  const [account, projects, configStatus, labelRules] = await Promise.all([
    prisma.googleAccount.findUnique({ where: { userId: user.id } }),
    prisma.project.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { createdAt: "desc" },
    }),
    getGoogleOAuthConfigStatus(),
    prisma.gmailLabelRule.findMany({
      where: { userId: user.id },
      include: { project: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const rules = labelRules.map((r) => ({
    id: r.id,
    label: r.label,
    projectId: r.projectId,
    projectName: r.project?.name ?? null,
  }));

  return (
    <div>
      <PageHeader
        title="연동"
        description="구글 계정을 연결해 Gmail 메일 수집 · 마감일 캘린더 · PMS 시트 리포트를 동기화합니다."
      />
      <div className="p-6">
        <GoogleIntegration
          configured={configStatus.configured}
          isAdmin={user.role === "ADMIN"}
          configStatus={configStatus}
          projects={projects}
          rules={rules}
          account={
            account
              ? {
                  status: account.status,
                  googleEmail: account.googleEmail,
                  scope: account.scope,
                  gmailSyncedAt: account.gmailSyncedAt
                    ? account.gmailSyncedAt.toISOString()
                    : null,
                  sheetsSpreadsheetId: account.sheetsSpreadsheetId,
                }
              : null
          }
        />
      </div>
    </div>
  );
}

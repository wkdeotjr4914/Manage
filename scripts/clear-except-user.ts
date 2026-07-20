/**
 * 특정 로그인 계정(+Google 연결)만 남기고 앱 데이터 전체 삭제 (테스트용 리셋).
 *   실행(드라이런):  npm run db:clear:user
 *   실행(실삭제):    npm run db:clear:user -- --yes
 *   대상 지정:       npm run db:clear:user -- --yes other@mail.com
 *
 * 유지: 대상 User·그 User의 GoogleAccount·Session, 전체 OAuthClientConfig, 대상 User의 Workspace.
 * 삭제: 그 외 모든 사용자와 모든 업무/지식/메일/입찰 데이터.
 * dc_pms 스키마로 격리되어 ERP public 스키마는 건드리지 않는다.
 */
import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL 이 설정되지 않았습니다.");
const schema = new URL(connectionString).searchParams.get("schema") ?? undefined;
const adapter = new PrismaPg(
  { connectionString, options: "-c datestyle=ISO,MDY" }, // db.ts와 동일 — Date 파싱용
  schema ? { schema } : undefined,
);
const prisma = new PrismaClient({ adapter });

const argv = process.argv.slice(2);
const YES = argv.includes("--yes") || process.env.CONFIRM === "yes";
const emailArg = argv.find((a) => a.includes("@"));
const KEEP_EMAIL = emailArg ?? process.env.KEEP_EMAIL ?? "wkdeotjr4914@gmail.com";

async function main() {
  const user = await prisma.user.findUnique({ where: { email: KEEP_EMAIL } });
  if (!user) throw new Error(`유지 대상 계정을 찾을 수 없음: ${KEEP_EMAIL}`);
  console.log(`유지 계정: ${KEEP_EMAIL} (id=${user.id})`);

  if (!YES) {
    // 드라이런: 삭제 예정 요약만 출력하고 중단
    console.log("⚠️  드라이런 — 실제 삭제하려면 -- --yes 를 붙이세요.");
    console.log({
      projects: await prisma.project.count(),
      notes: await prisma.note.count(),
      collectedMails: await prisma.collectedMail.count(),
      bids: await prisma.bidNotice.count(),
      otherUsers: await prisma.user.count({ where: { id: { not: user.id } } }),
    });
    return;
  }

  if (process.env.SKIP_BACKUP !== "1") {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-"); // 스크립트라 new Date() OK
    const dump = {
      users: await prisma.user.findMany(),
      projects: await prisma.project.findMany(),
      tasks: await prisma.task.findMany(),
      requirements: await prisma.requirement.findMany(),
      requirementSpecs: await prisma.requirementSpec.findMany(),
      wbsItems: await prisma.wBSItem.findMany(),
      pmsTasks: await prisma.pmsTask.findMany(),
      deliverables: await prisma.deliverable.findMany(),
      staffDemands: await prisma.staffDemand.findMany(),
      staffMembers: await prisma.staffMember.findMany(),
      notes: await prisma.note.findMany(),
      edges: await prisma.edge.findMany(),
      tags: await prisma.tag.findMany(),
      topics: await prisma.topic.findMany(),
      noteTags: await prisma.noteTag.findMany(),
      noteLinks: await prisma.noteLink.findMany(),
      bidNotices: await prisma.bidNotice.findMany(),
      collectedMails: await prisma.collectedMail.findMany(),
      gmailLabelRules: await prisma.gmailLabelRule.findMany(),
      googleAccounts: await prisma.googleAccount.findMany(),
      googleCalendarLinks: await prisma.googleCalendarLink.findMany(),
      oAuthClientConfigs: await prisma.oAuthClientConfig.findMany(),
    };
    mkdirSync("backups", { recursive: true });
    const path = `backups/backup-${stamp}.json`;
    writeFileSync(path, JSON.stringify(dump, null, 2));
    console.log(`💾 백업 저장: ${path}`);
  }

  const keepUser = { userId: { not: user.id } };
  console.log("🧹 삭제 중...");
  await prisma.noteLink.deleteMany();
  await prisma.edge.deleteMany();
  await prisma.noteTag.deleteMany();
  await prisma.requirement.deleteMany();
  await prisma.requirementSpec.deleteMany();
  await prisma.deliverable.deleteMany();
  await prisma.staffDemand.deleteMany();
  await prisma.staffMember.deleteMany();
  await prisma.pmsTask.deleteMany();
  await prisma.wBSItem.deleteMany();
  await prisma.task.deleteMany();
  await prisma.collectedMail.deleteMany();
  await prisma.gmailLabelRule.deleteMany();
  await prisma.googleCalendarLink.deleteMany();
  await prisma.project.deleteMany();
  await prisma.note.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.topic.deleteMany();
  await prisma.bidNotice.deleteMany();
  await prisma.oAuthState.deleteMany();
  await prisma.session.deleteMany({ where: keepUser });        // 대상 로그인 유지
  await prisma.googleAccount.deleteMany({ where: keepUser });  // 대상 Google 연결 유지
  await prisma.user.deleteMany({ where: { id: { not: user.id } } });
  if (user.workspaceId) {
    await prisma.workspace.deleteMany({ where: { id: { not: user.workspaceId } } });
  } else {
    await prisma.workspace.deleteMany();
  }

  console.log("✅ 완료:", {
    users: await prisma.user.count(),                  // 1
    googleAccounts: await prisma.googleAccount.count(), // 1 (연결 유지 시)
    projects: await prisma.project.count(),            // 0
    notes: await prisma.note.count(),                  // 0
    collectedMails: await prisma.collectedMail.count(),// 0
    bids: await prisma.bidNotice.count(),              // 0
  });
}

main()
  .catch((e) => {
    console.error("❌ 실패:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

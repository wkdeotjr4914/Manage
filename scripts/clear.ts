/**
 * 앱 데이터 전체 삭제 (dc_pms 스키마의 앱 테이블만 비움).
 * 테이블 구조는 유지하고 행만 지운다. ERP public 스키마는 건드리지 않음.
 *   실행: npm run db:clear
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
const schema = connectionString
  ? new URL(connectionString).searchParams.get("schema") ?? undefined
  : undefined;
const adapter = new PrismaPg(
  { connectionString },
  schema ? { schema } : undefined,
);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🧹 앱 데이터 삭제 중...");
  await prisma.noteLink.deleteMany();
  await prisma.edge.deleteMany();
  await prisma.noteTag.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.note.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.topic.deleteMany();
  await prisma.user.deleteMany();
  await prisma.workspace.deleteMany();

  const counts = {
    notes: await prisma.note.count(),
    edges: await prisma.edge.count(),
    tags: await prisma.tag.count(),
    topics: await prisma.topic.count(),
    projects: await prisma.project.count(),
    tasks: await prisma.task.count(),
  };
  console.log("✅ 삭제 완료 (모두 0이어야 함):", counts);
}

main()
  .catch((e) => {
    console.error("❌ 삭제 실패:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

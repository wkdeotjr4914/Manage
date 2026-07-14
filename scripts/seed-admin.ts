import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/lib/password";

// Idempotent ADMIN bootstrap — does NOT wipe any data (unlike db:seed). Safe to
// run against production to create/reset the first admin account.
//   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD (필수, 8자+), SEED_ADMIN_NAME
const connectionString = process.env.DATABASE_URL;
const schema = connectionString
  ? new URL(connectionString).searchParams.get("schema") ?? undefined
  : undefined;
const adapter = new PrismaPg(
  // Same ISO datestyle + explicit schema as src/server/db.ts (EDB / dc_pms).
  { connectionString, options: "-c datestyle=ISO,MDY" },
  schema ? { schema } : undefined,
);
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "wkdeotjr4914@gmail.com")
    .trim()
    .toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME ?? "관리자";

  if (!password || password.length < 8) {
    console.error(
      "❌ SEED_ADMIN_PASSWORD 환경변수가 필요합니다(8자 이상). 예: SEED_ADMIN_PASSWORD=... npm run db:seed:admin",
    );
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    update: { role: "ADMIN", passwordHash, name },
    create: { email, name, role: "ADMIN", passwordHash },
  });

  console.log(`✅ 관리자 계정 준비 완료: ${user.email} (${user.role})`);
}

main()
  .catch((e) => {
    console.error("❌ 실패:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

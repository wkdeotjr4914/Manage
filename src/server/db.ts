import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 uses driver adapters at runtime instead of a bundled query engine.
// The pg adapter opens its own connection pool from DATABASE_URL.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

/** Extract the `?schema=` value from the connection string, if present. */
function schemaFromUrl(url: string): string | undefined {
  try {
    return new URL(url).searchParams.get("schema") ?? undefined;
  } catch {
    return undefined;
  }
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL 환경변수가 설정되지 않았습니다. .env 파일을 확인하세요.",
    );
  }
  // The pg driver adapter ignores `?schema=`, so pass the schema explicitly.
  // Prisma then qualifies every query with it (e.g. "dc_pms"."Note"), keeping
  // this app's tables away from any same-named tables in `public`.
  const schema = schemaFromUrl(connectionString);
  const adapter = new PrismaPg(
    // This is an Oracle-compatible Postgres (EDB): it defaults to emitting
    // timestamps as `DD-MON-YY` (e.g. "13-JUL-26"), which the `pg` driver's
    // date parser can't read — every Date comes back `Invalid Date`. Force ISO
    // datestyle on the connection so timestamps parse correctly app-wide.
    { connectionString, options: "-c datestyle=ISO,MDY" },
    schema ? { schema } : undefined,
  );
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

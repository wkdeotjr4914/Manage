import { requireAdmin } from "@/server/auth";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/shell/PageHeader";
import { UserAdmin } from "@/components/admin/UserAdmin";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  // Double guard: the (app) layout already requires a user; this requires ADMIN.
  const admin = await requireAdmin();

  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const rows = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    created: u.createdAt.toISOString().slice(0, 10),
  }));

  return (
    <div>
      <PageHeader
        title="사용자 관리"
        description="계정을 생성하고 권한(역할)을 관리합니다."
      />
      <div className="p-6">
        <UserAdmin users={rows} currentUserId={admin.id} />
      </div>
    </div>
  );
}

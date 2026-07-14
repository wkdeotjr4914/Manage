"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { createSession, destroySession } from "@/server/session";
import { hashPassword, verifyPassword, DUMMY_HASH } from "@/lib/password";
import { loginSchema, createUserSchema, updateUserSchema } from "@/lib/validation";
import type { ActionResult } from "./notes";

/** Email + password login. On success sets the session cookie. */
export async function login(input: unknown): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  // Always run a hash verification (dummy hash when the user is missing) so the
  // response time doesn't leak whether the email exists.
  const passwordOk = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !passwordOk) {
    return { ok: false, error: "이메일 또는 비밀번호가 올바르지 않습니다." };
  }

  await createSession(user.id);
  return { ok: true };
}

/** Clear the session and go back to /login. Bind directly to a <form action>. */
export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}

/** ADMIN-only: create a new user account. */
export async function createUser(input: unknown): Promise<ActionResult<{ id: string }>> {
  const admin = await requireAdmin();

  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  const { email, name, password, role } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { ok: false, error: "이미 등록된 이메일입니다." };
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    // Inherit the admin's workspace so tenant isolation (if enabled later) works.
    data: { email, name, role, passwordHash, workspaceId: admin.workspaceId },
  });

  revalidatePath("/admin/users");
  return { ok: true, data: { id: user.id } };
}

/** ADMIN-only: update an existing account. Blank password keeps the current one. */
export async function updateUser(id: string, input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" };
  }
  const { email, name, role, password } = parsed.data;

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return { ok: false, error: "사용자를 찾을 수 없습니다." };
  }

  // Email is unique — only re-check when it actually changed.
  if (email !== target.email) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return { ok: false, error: "이미 등록된 이메일입니다." };
    }
  }

  // Guard against locking everyone out: don't let an admin drop their own admin
  // rights, and don't demote the last remaining admin.
  if (target.role === "ADMIN" && role !== "ADMIN") {
    if (target.id === admin.id) {
      return { ok: false, error: "본인 계정의 관리자 권한은 해제할 수 없습니다." };
    }
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      return { ok: false, error: "마지막 관리자의 권한은 해제할 수 없습니다." };
    }
  }

  const data: { email: string; name: string; role: typeof role; passwordHash?: string } = {
    email,
    name,
    role,
  };
  if (password) {
    data.passwordHash = await hashPassword(password);
  }

  try {
    await prisma.user.update({ where: { id }, data });
  } catch (err) {
    // P2002 = unique constraint (email) lost a race with a concurrent write.
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return { ok: false, error: "이미 등록된 이메일입니다." };
    }
    throw err;
  }

  revalidatePath("/admin/users");
  return { ok: true };
}

/** ADMIN-only: delete an account. Detaches the user's authored notes / owned
 * projects / assigned tasks (optional FKs) and drops sessions in one transaction
 * so the delete succeeds regardless of the DB's referential action. */
export async function deleteUser(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();

  if (id === admin.id) {
    return { ok: false, error: "자기 자신은 삭제할 수 없습니다." };
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return { ok: false, error: "사용자를 찾을 수 없습니다." };
  }

  if (target.role === "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      return { ok: false, error: "마지막 관리자는 삭제할 수 없습니다." };
    }
  }

  // Explicitly null out the optional references (and drop sessions) before the
  // delete. This keeps content authored/owned by the user but guarantees no FK
  // violation even if the DB constraint wasn't created as ON DELETE SET NULL.
  await prisma.$transaction([
    prisma.note.updateMany({ where: { authorId: id }, data: { authorId: null } }),
    prisma.project.updateMany({ where: { ownerId: id }, data: { ownerId: null } }),
    prisma.task.updateMany({ where: { assigneeId: id }, data: { assigneeId: null } }),
    prisma.session.deleteMany({ where: { userId: id } }),
    prisma.user.delete({ where: { id } }),
  ]);

  revalidatePath("/admin/users");
  return { ok: true };
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Pencil, Trash2, Loader2 } from "lucide-react";
import { createUser, updateUser, deleteUser } from "@/server/actions/auth";
import { ROLE_VALUES } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";

type Row = {
  id: string;
  email: string;
  name: string | null;
  role: (typeof ROLE_VALUES)[number];
  created: string;
};

const roleLabel = (role: string) => (role === "ADMIN" ? "관리자" : "멤버");

export function UserAdmin({
  users,
  currentUserId,
}: {
  users: Row[];
  currentUserId: string;
}) {
  const router = useRouter();

  // 생성 폼
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Row["role"]>("MEMBER");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 수정 모달
  const [editing, setEditing] = useState<Row | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState<Row["role"]>("MEMBER");
  const [editError, setEditError] = useState<string | null>(null);
  const [editPending, startEditTransition] = useTransition();

  // 삭제 (행 인라인 확인)
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePending, startDeleteTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await createUser({ email, name, password, role });
      if (res.ok) {
        setNotice(`${email} 계정을 생성했습니다.`);
        setEmail("");
        setName("");
        setPassword("");
        setRole("MEMBER");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function openEdit(u: Row) {
    setEditing(u);
    setEditName(u.name ?? "");
    setEditEmail(u.email);
    setEditPassword("");
    setEditRole(u.role);
    setEditError(null);
  }

  function onSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setEditError(null);
    startEditTransition(async () => {
      const res = await updateUser(editing.id, {
        email: editEmail,
        name: editName,
        role: editRole,
        password: editPassword,
      });
      if (res.ok) {
        setEditing(null);
        router.refresh();
      } else {
        setEditError(res.error);
      }
    });
  }

  function onDelete(id: string) {
    setDeleteError(null);
    startDeleteTransition(async () => {
      const res = await deleteUser(id);
      if (res.ok) {
        setConfirmingId(null);
        router.refresh();
      } else {
        setConfirmingId(null);
        setDeleteError(res.error);
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      {/* 사용자 목록 */}
      <div className="flex flex-col gap-2">
        <div className="overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-left text-xs text-muted">
                <th className="px-4 py-2.5 font-medium">이름</th>
                <th className="px-4 py-2.5 font-medium">이메일</th>
                <th className="px-4 py-2.5 font-medium">역할</th>
                <th className="px-4 py-2.5 font-medium">생성일</th>
                <th className="px-4 py-2.5 text-right font-medium">작업</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 text-foreground">{u.name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted">{u.email}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={
                        u.role === "ADMIN"
                          ? "rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                          : "rounded-full bg-surface-3 px-2 py-0.5 text-xs font-medium text-muted"
                      }
                    >
                      {roleLabel(u.role)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-2">{u.created}</td>
                  <td className="px-4 py-2.5">
                    {confirmingId === u.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-xs text-muted">삭제할까요?</span>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => onDelete(u.id)}
                          disabled={deletePending}
                        >
                          {deletePending && (
                            <Loader2 className="size-4 animate-spin" />
                          )}
                          삭제
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmingId(null)}
                          disabled={deletePending}
                        >
                          취소
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(u)}
                        >
                          <Pencil className="size-4" />
                          수정
                        </Button>
                        {u.id !== currentUserId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDeleteError(null);
                              setConfirmingId(u.id);
                            }}
                          >
                            <Trash2 className="size-4" />
                            삭제
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td
                    className="px-4 py-6 text-center text-muted-2"
                    colSpan={5}
                  >
                    아직 사용자가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {deleteError && (
          <p className="text-sm text-danger" role="alert">
            {deleteError}
          </p>
        )}
      </div>

      {/* 사용자 생성 폼 */}
      <form
        onSubmit={onSubmit}
        className="flex h-fit flex-col gap-4 rounded-2xl border border-border bg-surface-2 p-5"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <UserPlus className="size-4 text-primary" />
          새 사용자
        </div>

        <div>
          <Label htmlFor="new-name">이름</Label>
          <Input
            id="new-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div>
          <Label htmlFor="new-email">이메일</Label>
          <Input
            id="new-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div>
          <Label htmlFor="new-password">비밀번호</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="8자 이상"
            required
          />
        </div>

        <div>
          <Label htmlFor="new-role">역할</Label>
          <Select
            id="new-role"
            value={role}
            onChange={(e) => setRole(e.target.value as Row["role"])}
          >
            {ROLE_VALUES.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </Select>
        </div>

        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        {notice && <p className="text-sm text-primary">{notice}</p>}

        <Button type="submit" disabled={pending}>
          {pending ? "생성 중…" : "계정 생성"}
        </Button>
      </form>

      {/* 사용자 수정 모달 */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="사용자 수정"
      >
        <form onSubmit={onSaveEdit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="edit-name">이름</Label>
            <Input
              id="edit-name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
            />
          </div>

          <div>
            <Label htmlFor="edit-email">이메일</Label>
            <Input
              id="edit-email"
              type="email"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <Label htmlFor="edit-password">비밀번호</Label>
            <Input
              id="edit-password"
              type="password"
              autoComplete="new-password"
              value={editPassword}
              onChange={(e) => setEditPassword(e.target.value)}
              placeholder="변경 시에만 입력 (8자 이상)"
            />
          </div>

          <div>
            <Label htmlFor="edit-role">역할</Label>
            <Select
              id="edit-role"
              value={editRole}
              onChange={(e) => setEditRole(e.target.value as Row["role"])}
            >
              {ROLE_VALUES.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </Select>
          </div>

          {editError && (
            <p className="text-sm text-danger" role="alert">
              {editError}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditing(null)}
              disabled={editPending}
            >
              취소
            </Button>
            <Button type="submit" disabled={editPending}>
              {editPending ? "저장 중…" : "저장"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

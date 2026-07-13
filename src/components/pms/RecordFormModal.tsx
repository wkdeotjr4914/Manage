"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Label } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import type { ActionResult } from "@/server/actions/notes";

export type FieldValue = string | boolean;

export type FieldDef =
  | {
      key: string;
      label: string;
      kind: "text" | "date";
      placeholder?: string;
      full?: boolean;
      required?: boolean;
    }
  | {
      key: string;
      label: string;
      kind: "textarea";
      placeholder?: string;
      rows?: number;
    }
  | { key: string; label: string; kind: "number"; min?: number; max?: number }
  | {
      key: string;
      label: string;
      kind: "select";
      options: { value: string; label: string }[];
    }
  | { key: string; label: string; kind: "checkbox" };

/**
 * Config-driven create/edit dialog shared by every PMS submenu. Each domain
 * supplies its field list + server actions; this renders the grid, wires up
 * submit/delete, and refreshes the route on success.
 */
export function RecordFormModal({
  title,
  fields,
  initial,
  projectId,
  itemId,
  onCreate,
  onUpdate,
  onDelete,
  onClose,
}: {
  title: string;
  fields: FieldDef[];
  initial: Record<string, FieldValue>;
  projectId: string;
  itemId: string | null;
  onCreate: (
    payload: Record<string, FieldValue>,
  ) => Promise<ActionResult<{ id: string }>>;
  onUpdate: (
    id: string,
    payload: Record<string, FieldValue>,
  ) => Promise<ActionResult>;
  onDelete: (id: string, projectId: string) => Promise<ActionResult>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState<Record<string, FieldValue>>(initial);

  const set = (k: string, v: FieldValue) =>
    setForm((f) => ({ ...f, [k]: v }));

  function submit() {
    setError(null);
    startTransition(async () => {
      const payload = { ...form, projectId };
      const res = itemId
        ? await onUpdate(itemId, payload)
        : await onCreate(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  function remove() {
    if (!itemId) return;
    setError(null);
    startTransition(async () => {
      const res = await onDelete(itemId, projectId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={title}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <div>
            {itemId &&
              (confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted">삭제할까요?</span>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={remove}
                    disabled={pending}
                  >
                    삭제
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(false)}
                    disabled={pending}
                  >
                    취소
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                  disabled={pending}
                >
                  <Trash2 className="size-4" /> 삭제
                </Button>
              ))}
          </div>
          <div className="flex items-center gap-2">
            {error && <span className="text-xs text-danger">{error}</span>}
            <Button variant="secondary" onClick={onClose} disabled={pending}>
              닫기
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {itemId ? "저장" : "추가"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map((f) => {
          const full = f.kind === "textarea" || ("full" in f && f.full);
          return (
            <div key={f.key} className={full ? "sm:col-span-2" : undefined}>
              {f.kind !== "checkbox" && (
                <Label htmlFor={f.key}>
                  {f.label}
                  {"required" in f && f.required && (
                    <span className="text-danger"> *</span>
                  )}
                </Label>
              )}
              {f.kind === "text" || f.kind === "date" ? (
                <Input
                  id={f.key}
                  type={f.kind === "date" ? "date" : "text"}
                  value={String(form[f.key] ?? "")}
                  placeholder={"placeholder" in f ? f.placeholder : undefined}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              ) : f.kind === "number" ? (
                <Input
                  id={f.key}
                  type="number"
                  min={f.min}
                  max={f.max}
                  value={String(form[f.key] ?? "")}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              ) : f.kind === "textarea" ? (
                <Textarea
                  id={f.key}
                  rows={f.rows}
                  value={String(form[f.key] ?? "")}
                  placeholder={f.placeholder}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              ) : f.kind === "select" ? (
                <Select
                  id={f.key}
                  value={String(form[f.key] ?? "")}
                  onChange={(e) => set(f.key, e.target.value)}
                >
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <label className="mt-6 flex h-9 items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={Boolean(form[f.key])}
                    onChange={(e) => set(f.key, e.target.checked)}
                    className="size-4 rounded border-border"
                  />
                  {f.label}
                </label>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

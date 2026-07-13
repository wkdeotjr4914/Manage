"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { createProject } from "@/server/actions/projects";

const SWATCHES = ["#a78bfa", "#34d399", "#60a5fa", "#fbbf24", "#f472b6", "#22d3ee"];

export function CreateProject() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(SWATCHES[0]);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createProject({ name, description, color });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setName("");
      setDescription("");
      setOpen(false);
      router.push(`/projects/${res.data!.id}`);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> 새 프로젝트
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setOpen(false)}>
      <div
        className="card-shadow w-full max-w-md rounded-2xl border border-border bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-sm font-semibold text-foreground">새 프로젝트</h2>
        <div className="flex flex-col gap-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="프로젝트 이름"
            autoFocus
          />
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="설명 (선택)"
            className="min-h-20"
          />
          <div className="flex gap-2">
            {SWATCHES.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="size-6 rounded-full transition-transform hover:scale-110"
                style={{
                  backgroundColor: c,
                  outline: color === c ? `2px solid ${c}` : "none",
                  outlineOffset: "2px",
                }}
                aria-label={`색상 ${c}`}
              />
            ))}
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              취소
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              만들기
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

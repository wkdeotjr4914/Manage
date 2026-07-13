"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { createTopic, deleteTopic } from "@/server/actions/tags";

const SWATCHES = ["#22d3ee", "#60a5fa", "#a78bfa", "#34d399", "#fbbf24", "#f472b6"];

type TopicRow = {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  count: number;
};

export function TopicsPanel({ topics }: { topics: TopicRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(SWATCHES[0]);
  const [error, setError] = useState<string | null>(null);

  function add() {
    setError(null);
    startTransition(async () => {
      const res = await createTopic({ name, description, color });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setName("");
      setDescription("");
      setOpen(false);
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deleteTopic(id);
      router.refresh();
    });
  }

  return (
    <div className="card-shadow flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">토픽</h2>
        <Button size="sm" variant="secondary" onClick={() => setOpen((o) => !o)}>
          <Plus className="size-4" /> 토픽
        </Button>
      </div>

      {open && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2/50 p-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="토픽 이름"
          />
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="설명 (선택)"
            className="min-h-16"
          />
          <div className="flex gap-2">
            {SWATCHES.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="size-5 rounded-full transition-transform hover:scale-110"
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
          <Button size="sm" onClick={add} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            만들기
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {topics.length === 0 && (
          <p className="text-xs text-muted-2">아직 토픽이 없습니다.</p>
        )}
        {topics.map((t) => {
          const c = t.color ?? "#94a3b8";
          return (
            <div
              key={t.id}
              className="group flex items-start gap-3 rounded-lg border border-border bg-surface-2/40 p-3"
            >
              <span
                className="mt-1 size-3 shrink-0 rounded-full"
                style={{ backgroundColor: c }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  {t.name}
                  <span className="ml-2 text-xs text-muted-2">노트 {t.count}</span>
                </p>
                {t.description && (
                  <p className="mt-0.5 text-xs text-muted">{t.description}</p>
                )}
              </div>
              <button
                onClick={() => remove(t.id)}
                disabled={pending}
                className="shrink-0 rounded p-1 text-muted-2 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                aria-label="토픽 삭제"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

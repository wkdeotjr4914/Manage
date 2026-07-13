"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { tint } from "@/lib/utils";
import { createTag, deleteTag } from "@/server/actions/tags";

const SWATCHES = ["#a78bfa", "#f472b6", "#60a5fa", "#34d399", "#22d3ee", "#fbbf24", "#f87171", "#fb7185"];

type TagRow = { id: string; name: string; color: string | null; count: number };

export function TagsPanel({ tags }: { tags: TagRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [color, setColor] = useState(SWATCHES[0]);
  const [error, setError] = useState<string | null>(null);

  function add() {
    setError(null);
    startTransition(async () => {
      const res = await createTag({ name, color });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setName("");
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deleteTag(id);
      router.refresh();
    });
  }

  return (
    <div className="card-shadow flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold text-foreground">태그</h2>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="새 태그 이름"
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <Button size="sm" onClick={add} disabled={pending} className="shrink-0">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            추가
          </Button>
        </div>
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
      </div>

      <div className="flex flex-wrap gap-2">
        {tags.length === 0 && (
          <p className="text-xs text-muted-2">아직 태그가 없습니다.</p>
        )}
        {tags.map((t) => {
          const c = t.color ?? "#94a3b8";
          return (
            <span
              key={t.id}
              className="group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
              style={tint(c)}
            >
              <Link href={`/notes?q=${encodeURIComponent(t.name)}`}>#{t.name}</Link>
              <span className="text-[10px] opacity-70">{t.count}</span>
              <button
                onClick={() => remove(t.id)}
                disabled={pending}
                className="opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                aria-label="태그 삭제"
              >
                <X className="size-3" />
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}

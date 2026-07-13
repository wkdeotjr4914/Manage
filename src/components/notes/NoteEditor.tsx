"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, Pencil, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Label } from "@/components/ui/field";
import { Markdown } from "./Markdown";
import { NODE_TYPES, NODE_TYPE_KEYS, type NodeTypeKey } from "@/lib/theme";
import { cn, tint } from "@/lib/utils";
import { createNote, updateNote } from "@/server/actions/notes";

type TagOption = { id: string; name: string; color: string | null };

export type NoteEditorProps = {
  mode: "create" | "edit";
  topics: { id: string; name: string }[];
  allTags: TagOption[];
  initial?: {
    id: string;
    title: string;
    content: string;
    summary: string | null;
    type: NodeTypeKey;
    topicId: string | null;
    tagIds: string[];
  };
};

export function NoteEditor({ mode, topics, allTags, initial }: NoteEditorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [type, setType] = useState<NodeTypeKey>(initial?.type ?? "SEMANTIC");
  const [topicId, setTopicId] = useState(initial?.topicId ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [tagIds, setTagIds] = useState<string[]>(initial?.tagIds ?? []);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleTag = (id: string) =>
    setTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );

  function submit() {
    setError(null);
    const input = { title, type, topicId, summary, content, tagIds };
    startTransition(async () => {
      const res =
        mode === "create"
          ? await createNote(input)
          : await updateNote(initial!.id, input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const id = mode === "create" ? res.data!.id : initial!.id;
      router.push(`/notes/${id}`);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
      <div>
        <Label>제목</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="노트 제목"
          autoFocus
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label>노드 타입</Label>
          <Select value={type} onChange={(e) => setType(e.target.value as NodeTypeKey)}>
            {NODE_TYPE_KEYS.map((k) => (
              <option key={k} value={k}>
                {NODE_TYPES[k].label} · {NODE_TYPES[k].description}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>토픽</Label>
          <Select value={topicId} onChange={(e) => setTopicId(e.target.value)}>
            <option value="">토픽 없음</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div>
        <Label>요약 (그래프·카드에 표시)</Label>
        <Input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="한 줄 요약"
        />
      </div>

      {allTags.length > 0 && (
        <div>
          <Label>태그</Label>
          <div className="flex flex-wrap gap-1.5">
            {allTags.map((t) => {
              const active = tagIds.includes(t.id);
              const color = t.color ?? "#94a3b8";
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTag(t.id)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-opacity",
                    active ? "opacity-100" : "opacity-50 hover:opacity-80",
                  )}
                  style={tint(color, active)}
                >
                  #{t.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <Label className="mb-0">본문 (마크다운)</Label>
          <button
            type="button"
            onClick={() => setPreview((p) => !p)}
            className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
          >
            {preview ? <Pencil className="size-3.5" /> : <Eye className="size-3.5" />}
            {preview ? "편집" : "미리보기"}
          </button>
        </div>
        {preview ? (
          <div className="min-h-64 rounded-lg border border-border bg-surface-2 p-4">
            {content ? (
              <Markdown>{content}</Markdown>
            ) : (
              <p className="text-sm text-muted-2">미리볼 내용이 없습니다.</p>
            )}
          </div>
        ) : (
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={"## 소제목\n\n- 목록\n- **강조**\n\n> 인용"}
            className="min-h-64 font-mono text-[13px]"
          />
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" onClick={() => router.back()} disabled={pending}>
          취소
        </Button>
        <Button onClick={submit} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {mode === "create" ? "노트 만들기" : "저장"}
        </Button>
      </div>
    </div>
  );
}

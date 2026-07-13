"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, X, Loader2, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { NODE_TYPES, type NodeTypeKey } from "@/lib/theme";
import { linkNote, unlinkNote } from "@/server/actions/links";

type LinkedNote = {
  linkId: string;
  relation: string | null;
  note: { id: string; title: string; type: NodeTypeKey };
};

export function ProjectNotes({
  projectId,
  links,
  candidates,
}: {
  projectId: string;
  links: LinkedNote[];
  candidates: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [noteId, setNoteId] = useState("");
  const [relation, setRelation] = useState("");

  function add() {
    if (!noteId) return;
    startTransition(async () => {
      await linkNote({ noteId, projectId, relation });
      setNoteId("");
      setRelation("");
      setOpen(false);
      router.refresh();
    });
  }

  function remove(linkId: string) {
    startTransition(async () => {
      await unlinkNote(linkId, projectId);
      router.refresh();
    });
  }

  return (
    <div className="card-shadow flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <StickyNote className="size-4 text-muted-2" />
          관련 지식 노트 ({links.length})
        </h2>
        <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
          <Plus className="size-4" /> 연결
        </Button>
      </div>

      {open && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2/50 p-3 sm:flex-row sm:items-center">
          <Select
            value={noteId}
            onChange={(e) => setNoteId(e.target.value)}
            className="flex-1"
          >
            <option value="">노트 선택…</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
          <Input
            value={relation}
            onChange={(e) => setRelation(e.target.value)}
            placeholder="관계 (예: 설계 근거)"
            className="sm:w-44"
          />
          <Button size="sm" onClick={add} disabled={pending} className="shrink-0">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            추가
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {links.length === 0 && !open && (
          <p className="text-xs text-muted-2">
            프로젝트의 근거가 되는 지식 노트를 연결해 보세요.
          </p>
        )}
        {links.map((l) => {
          const meta = NODE_TYPES[l.note.type];
          return (
            <span
              key={l.linkId}
              className="group inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2/60 py-1 pl-2 pr-1 text-xs"
            >
              <span className="size-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
              <Link href={`/notes/${l.note.id}`} className="text-foreground hover:underline">
                {l.note.title}
              </Link>
              {l.relation && <Badge>{l.relation}</Badge>}
              <button
                onClick={() => remove(l.linkId)}
                disabled={pending}
                className="rounded p-0.5 text-muted-2 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                aria-label="연결 해제"
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

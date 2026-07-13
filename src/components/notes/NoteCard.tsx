import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { NODE_TYPES, type NodeTypeKey } from "@/lib/theme";
import { formatDate } from "@/lib/utils";

export type NoteCardData = {
  id: string;
  title: string;
  summary: string | null;
  type: NodeTypeKey;
  updatedAt: Date | string;
  topic: { name: string; color: string | null } | null;
  tags: { name: string }[];
  _count?: { outgoingEdges: number; incomingEdges: number };
};

export function NoteCard({ note }: { note: NoteCardData }) {
  const meta = NODE_TYPES[note.type];
  const connections =
    (note._count?.outgoingEdges ?? 0) + (note._count?.incomingEdges ?? 0);

  return (
    <Link
      href={`/notes/${note.id}`}
      className="group card-shadow card-shadow-hover flex flex-col gap-2.5 rounded-2xl border border-border bg-surface p-4 transition-all hover:border-border-strong"
    >
      <div className="flex items-center justify-between gap-2">
        <Badge color={meta.color}>{meta.label}</Badge>
        <span className="text-[11px] text-muted-2">{formatDate(note.updatedAt)}</span>
      </div>

      <h3 className="text-sm font-semibold leading-snug text-foreground group-hover:text-primary">
        {note.title}
      </h3>

      {note.summary && (
        <p className="line-clamp-2 text-xs leading-relaxed text-muted">
          {note.summary}
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
        {note.topic && (
          <Badge color={note.topic.color ?? undefined}>{note.topic.name}</Badge>
        )}
        {note.tags.slice(0, 3).map((t) => (
          <Badge key={t.name}>#{t.name}</Badge>
        ))}
        {connections > 0 && (
          <span className="ml-auto text-[11px] text-muted-2">
            연결 {connections}
          </span>
        )}
      </div>
    </Link>
  );
}

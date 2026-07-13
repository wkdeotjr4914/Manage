import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, FolderKanban, ListTodo } from "lucide-react";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/notes/Markdown";
import { NoteConnections } from "@/components/notes/NoteConnections";
import { NoteActions } from "@/components/notes/NoteActions";
import { NODE_TYPES, type NodeTypeKey } from "@/lib/theme";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function NoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const note = await prisma.note.findUnique({
    where: { id },
    include: {
      author: { select: { name: true } },
      topic: { select: { id: true, name: true, color: true } },
      tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
      outgoingEdges: {
        select: {
          id: true,
          type: true,
          target: { select: { id: true, title: true, type: true } },
        },
      },
      incomingEdges: {
        select: {
          id: true,
          type: true,
          source: { select: { id: true, title: true, type: true } },
        },
      },
      links: {
        select: {
          id: true,
          relation: true,
          project: { select: { id: true, name: true } },
          task: { select: { id: true, title: true, projectId: true } },
        },
      },
    },
  });

  if (!note) notFound();

  const meta = NODE_TYPES[note.type as NodeTypeKey];

  const candidates = await prisma.note.findMany({
    where: { id: { not: id } },
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });

  return (
    <div>
      <PageHeader
        title={<span className="flex items-center gap-3">{note.title}</span>}
        actions={
          <>
            <Link href={`/notes/${id}/edit`}>
              <Button variant="secondary">
                <Pencil className="size-4" /> 편집
              </Button>
            </Link>
            <NoteActions id={id} />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge color={meta.color}>{meta.label}</Badge>
            {note.topic && (
              <Badge color={note.topic.color ?? undefined}>{note.topic.name}</Badge>
            )}
            {note.tags.map((t) => (
              <Badge key={t.tag.id} color={t.tag.color ?? undefined}>
                #{t.tag.name}
              </Badge>
            ))}
            <span className="ml-auto text-xs text-muted-2">
              {note.author?.name ? `${note.author.name} · ` : ""}
              {formatDate(note.updatedAt)}
            </span>
          </div>

          {note.summary && (
            <p className="mb-5 rounded-lg border border-border bg-surface-2/60 p-3 text-sm text-muted">
              {note.summary}
            </p>
          )}

          {note.content ? (
            <Markdown>{note.content}</Markdown>
          ) : (
            <p className="text-sm text-muted-2">본문이 비어 있습니다.</p>
          )}

          {note.links.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-2 text-sm font-semibold text-foreground">
                연결된 프로젝트 · 태스크
              </h2>
              <div className="flex flex-col gap-1.5">
                {note.links.map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center gap-2 rounded-lg border border-border bg-surface-2/50 px-3 py-2 text-sm"
                  >
                    {l.project ? (
                      <>
                        <FolderKanban className="size-4 text-muted-2" />
                        <Link
                          href={`/projects/${l.project.id}`}
                          className="text-foreground hover:underline"
                        >
                          {l.project.name}
                        </Link>
                      </>
                    ) : l.task ? (
                      <>
                        <ListTodo className="size-4 text-muted-2" />
                        <Link
                          href={`/projects/${l.task.projectId}`}
                          className="text-foreground hover:underline"
                        >
                          {l.task.title}
                        </Link>
                      </>
                    ) : null}
                    {l.relation && (
                      <span className="ml-auto text-xs text-muted-2">{l.relation}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <NoteConnections
            noteId={id}
            outgoing={note.outgoingEdges.map((e) => ({
              id: e.id,
              type: e.type,
              node: { ...e.target, type: e.target.type as NodeTypeKey },
            }))}
            incoming={note.incomingEdges.map((e) => ({
              id: e.id,
              type: e.type,
              node: { ...e.source, type: e.source.type as NodeTypeKey },
            }))}
            candidates={candidates}
          />
        </aside>
      </div>
    </div>
  );
}

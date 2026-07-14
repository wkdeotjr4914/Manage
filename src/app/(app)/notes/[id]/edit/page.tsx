import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { NoteEditor } from "@/components/notes/NoteEditor";
import { PageHeader } from "@/components/shell/PageHeader";
import type { NodeTypeKey } from "@/lib/theme";

export const dynamic = "force-dynamic";
export const metadata = { title: "노트 편집 · Second Brain" };

export default async function EditNotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [note, topics, allTags] = await Promise.all([
    prisma.note.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        content: true,
        summary: true,
        type: true,
        topicId: true,
        tags: { select: { tagId: true } },
      },
    }),
    prisma.topic.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.tag.findMany({
      select: { id: true, name: true, color: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!note) notFound();

  return (
    <div>
      <PageHeader title="노트 편집" />
      <NoteEditor
        mode="edit"
        topics={topics}
        allTags={allTags}
        initial={{
          id: note.id,
          title: note.title,
          content: note.content,
          summary: note.summary,
          type: note.type as NodeTypeKey,
          topicId: note.topicId,
          tagIds: note.tags.map((t) => t.tagId),
        }}
      />
    </div>
  );
}

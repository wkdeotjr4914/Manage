import { prisma } from "@/server/db";
import { NoteEditor } from "@/components/notes/NoteEditor";
import { PageHeader } from "@/components/shell/PageHeader";

export const dynamic = "force-dynamic";
export const metadata = { title: "새 노트 · Second Brain" };

export default async function NewNotePage() {
  const [topics, allTags] = await Promise.all([
    prisma.topic.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.tag.findMany({
      select: { id: true, name: true, color: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div>
      <PageHeader title="새 노트" description="새 지식 노드를 추가합니다." />
      <NoteEditor mode="create" topics={topics} allTags={allTags} />
    </div>
  );
}

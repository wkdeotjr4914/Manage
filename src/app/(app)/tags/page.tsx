import { prisma } from "@/server/db";
import { PageHeader } from "@/components/shell/PageHeader";
import { TagsPanel } from "@/components/tags/TagsPanel";
import { TopicsPanel } from "@/components/tags/TopicsPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "태그 · 토픽 · Second Brain" };

export default async function TagsPage() {
  const [tags, topics] = await Promise.all([
    prisma.tag.findMany({
      select: {
        id: true,
        name: true,
        color: true,
        _count: { select: { notes: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.topic.findMany({
      select: {
        id: true,
        name: true,
        color: true,
        description: true,
        _count: { select: { notes: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="태그 · 토픽"
        description="지식을 분류하는 태그와 토픽을 관리합니다."
      />
      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-2">
        <TopicsPanel
          topics={topics.map((t) => ({
            id: t.id,
            name: t.name,
            color: t.color,
            description: t.description,
            count: t._count.notes,
          }))}
        />
        <TagsPanel
          tags={tags.map((t) => ({
            id: t.id,
            name: t.name,
            color: t.color,
            count: t._count.notes,
          }))}
        />
      </div>
    </div>
  );
}

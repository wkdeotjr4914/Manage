import Link from "next/link";
import { Plus, StickyNote, Search } from "lucide-react";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/shell/PageHeader";
import { NoteCard } from "@/components/notes/NoteCard";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { NODE_TYPES, NODE_TYPE_KEYS, type NodeTypeKey } from "@/lib/theme";
import { cn, tint } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "노트 · Second Brain" };

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; project?: string }>;
}) {
  const { q, type, project } = await searchParams;
  const activeType = NODE_TYPE_KEYS.includes(type as NodeTypeKey)
    ? (type as NodeTypeKey)
    : undefined;

  const projects = await prisma.project.findMany({
    select: { id: true, name: true, color: true },
    orderBy: { name: "asc" },
  });
  // Ignore a stale/unknown project id so the filter never hides every note.
  const activeProject = projects.some((p) => p.id === project)
    ? project
    : undefined;

  const notes = await prisma.note.findMany({
    where: {
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { summary: { contains: q, mode: "insensitive" } },
              { content: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(activeType ? { type: activeType } : {}),
      // A note joins a project through NoteLink (same shape the graph uses).
      ...(activeProject ? { links: { some: { projectId: activeProject } } } : {}),
    },
    select: {
      id: true,
      title: true,
      summary: true,
      type: true,
      updatedAt: true,
      topic: { select: { name: true, color: true } },
      tags: { select: { tag: { select: { name: true } } } },
      _count: { select: { outgoingEdges: true, incomingEdges: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const cards = notes.map((n) => ({
    ...n,
    type: n.type as NodeTypeKey,
    tags: n.tags.map((t) => t.tag),
  }));

  // Build a /notes href that keeps the other active filters. Pass a key as
  // `null` to clear it, omit it to keep the current value.
  const buildHref = (over: {
    type?: NodeTypeKey | null;
    project?: string | null;
  }) => {
    const t = over.type === undefined ? activeType : over.type ?? undefined;
    const pr =
      over.project === undefined ? activeProject : over.project ?? undefined;
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (t) p.set("type", t);
    if (pr) p.set("project", pr);
    const s = p.toString();
    return `/notes${s ? `?${s}` : ""}`;
  };

  return (
    <div>
      <PageHeader
        title="노트"
        description="회사 지식을 노드로 기록하고 서로 연결하세요."
        actions={
          <Link href="/notes/new">
            <Button>
              <Plus className="size-4" /> 새 노트
            </Button>
          </Link>
        }
      />

      <div className="flex flex-col gap-4 p-6">
        <form method="get" className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-2" />
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="제목·요약·본문 검색"
              className="h-9 w-full rounded-lg border border-border bg-surface-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            />
          </div>
          {activeType && <input type="hidden" name="type" value={activeType} />}
          {activeProject && (
            <input type="hidden" name="project" value={activeProject} />
          )}
          <Button type="submit" variant="secondary">
            검색
          </Button>
        </form>

        {projects.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-2">
              프로젝트
            </span>
            <div className="flex flex-wrap gap-1.5">
              <Link
                href={buildHref({ project: null })}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  !activeProject
                    ? "border-primary/40 bg-primary/15 text-foreground"
                    : "border-border text-muted hover:text-foreground",
                )}
              >
                전체
              </Link>
              {projects.map((p) => {
                const active = activeProject === p.id;
                const color = p.color ?? "#94a3b8";
                return (
                  <Link
                    key={p.id}
                    href={buildHref({ project: p.id })}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-opacity",
                      active ? "opacity-100" : "opacity-70 hover:opacity-100",
                    )}
                    style={tint(color, active)}
                  >
                    {p.name}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          <Link
            href={buildHref({ type: null })}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              !activeType
                ? "border-primary/40 bg-primary/15 text-foreground"
                : "border-border text-muted hover:text-foreground",
            )}
          >
            전체
          </Link>
          {NODE_TYPE_KEYS.map((k) => {
            const meta = NODE_TYPES[k];
            const active = activeType === k;
            return (
              <Link
                key={k}
                href={buildHref({ type: k })}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-opacity",
                  active ? "opacity-100" : "opacity-70 hover:opacity-100",
                )}
                style={tint(meta.color, active)}
              >
                {meta.label}
              </Link>
            );
          })}
        </div>

        {cards.length === 0 ? (
          <EmptyState
            icon={<StickyNote className="size-8" />}
            title="노트가 없습니다"
            description={
              q || activeType || activeProject
                ? "필터에 맞는 노트가 없어요."
                : "첫 노트를 만들어 지식 그래프를 시작하세요."
            }
            action={
              <Link href="/notes/new">
                <Button>
                  <Plus className="size-4" /> 새 노트
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((n) => (
              <NoteCard key={n.id} note={n} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

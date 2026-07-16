import Link from "next/link";
import {
  Network,
  StickyNote,
  GitBranch,
  ListTodo,
  ArrowRight,
  TrendingUp,
  Minus,
} from "lucide-react";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { NoteCard } from "@/components/notes/NoteCard";
import { NODE_TYPES, NODE_TYPE_KEYS, type NodeTypeKey } from "@/lib/theme";
import { daysAgo, tint } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "대시보드 · Second Brain" };

export default async function DashboardPage() {
  // Window for the "new in the last 7 days" trend shown on each stat card.
  const since = daysAgo(7);

  const [
    noteCount,
    edgeCount,
    projectCount,
    typeGroups,
    recentNotes,
    projects,
    inProgress,
    weekNotes,
    weekEdges,
    weekProjects,
    weekTasks,
  ] = await Promise.all([
    prisma.note.count(),
    prisma.edge.count(),
    prisma.project.count(),
    prisma.note.groupBy({ by: ["type"], _count: { _all: true } }),
    prisma.note.findMany({
      take: 6,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        summary: true,
        type: true,
        source: true,
        updatedAt: true,
        topic: { select: { name: true, color: true } },
        tags: { select: { tag: { select: { name: true } } } },
        _count: { select: { outgoingEdges: true, incomingEdges: true } },
      },
    }),
    prisma.project.findMany({
      take: 4,
      orderBy: { createdAt: "desc" },
      include: { tasks: { select: { status: true } } },
    }),
    prisma.task.count({ where: { status: "IN_PROGRESS" } }),
    prisma.note.count({ where: { createdAt: { gte: since } } }),
    prisma.edge.count({ where: { createdAt: { gte: since } } }),
    prisma.project.count({ where: { createdAt: { gte: since } } }),
    prisma.task.count({ where: { status: "IN_PROGRESS", createdAt: { gte: since } } }),
  ]);

  const typeMap = new Map(typeGroups.map((g) => [g.type, g._count._all]));
  const maxType = Math.max(1, ...typeGroups.map((g) => g._count._all));

  const stats = [
    { label: "노드", value: noteCount, delta: weekNotes, icon: StickyNote, href: "/notes", color: "#60a5fa" },
    { label: "엣지", value: edgeCount, delta: weekEdges, icon: GitBranch, href: "/graph", color: "#a78bfa" },
    { label: "프로젝트", value: projectCount, delta: weekProjects, icon: Network, href: "/projects", color: "#34d399" },
    { label: "진행 중 태스크", value: inProgress, delta: weekTasks, icon: ListTodo, href: "/projects", color: "#fbbf24" },
  ];

  const cards = recentNotes.map((n) => ({
    ...n,
    type: n.type as NodeTypeKey,
    tags: n.tags.map((t) => t.tag),
  }));

  return (
    <div>
      <PageHeader
        title="대시보드"
        description="회사의 지식과 프로젝트를 한눈에."
        actions={
          <Link href="/graph">
            <Button>
              <Network className="size-4" /> 그래프 열기
            </Button>
          </Link>
        }
      />

      <div className="flex flex-col gap-6 p-6">
        {/* stat cards */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {stats.map((s) => (
            <Link
              key={s.label}
              href={s.href}
              className="group card-shadow card-shadow-hover flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 transition-all hover:border-border-strong"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-2xl font-bold text-foreground">
                    {s.value}
                  </div>
                  <div className="mt-1 text-xs font-medium text-muted-2">
                    {s.label}
                  </div>
                </div>
                <span
                  className="grid size-12 shrink-0 place-items-center rounded-2xl border"
                  style={tint(s.color, true)}
                >
                  <s.icon className="size-5" />
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                {s.delta > 0 ? (
                  <>
                    <TrendingUp className="size-3.5 text-success" />
                    <span className="font-semibold text-success">+{s.delta}</span>
                  </>
                ) : (
                  <>
                    <Minus className="size-3.5 text-muted-2" />
                    <span className="font-semibold text-muted-2">0</span>
                  </>
                )}
                <span className="text-muted-2">지난 7일</span>
              </div>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem]">
          {/* recent notes */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">최근 노트</h2>
              <Link
                href="/notes"
                className="flex items-center gap-1 text-xs text-muted hover:text-foreground"
              >
                전체 보기 <ArrowRight className="size-3.5" />
              </Link>
            </div>
            {cards.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-2">
                아직 노트가 없습니다.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {cards.map((n) => (
                  <NoteCard key={n.id} note={n} />
                ))}
              </div>
            )}
          </section>

          {/* sidebar: type distribution + projects */}
          <aside className="flex flex-col gap-6">
            <section className="card-shadow rounded-2xl border border-border bg-surface p-5">
              <h2 className="mb-4 text-sm font-semibold text-foreground">
                노드 타입 분포
              </h2>
              <div className="flex flex-col gap-2.5">
                {NODE_TYPE_KEYS.map((k) => {
                  const count = typeMap.get(k) ?? 0;
                  const meta = NODE_TYPES[k];
                  return (
                    <div key={k} className="flex items-center gap-2 text-xs">
                      <span className="w-14 shrink-0 text-muted">{meta.label}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(count / maxType) * 100}%`,
                            backgroundColor: meta.color,
                          }}
                        />
                      </div>
                      <span className="w-5 shrink-0 text-right text-muted-2">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="card-shadow rounded-2xl border border-border bg-surface p-5">
              <h2 className="mb-4 text-sm font-semibold text-foreground">
                프로젝트 진행
              </h2>
              <div className="flex flex-col gap-3">
                {projects.length === 0 && (
                  <p className="text-xs text-muted-2">프로젝트가 없습니다.</p>
                )}
                {projects.map((p) => {
                  const total = p.tasks.length;
                  const done = p.tasks.filter((t) => t.status === "DONE").length;
                  const pct = total ? Math.round((done / total) * 100) : 0;
                  const color = p.color ?? "#7c6cf0";
                  return (
                    <Link key={p.id} href={`/projects/${p.id}`} className="group">
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="truncate text-foreground group-hover:text-primary">
                          {p.name}
                        </span>
                        <span className="text-muted-2">{pct}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, backgroundColor: color }}
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

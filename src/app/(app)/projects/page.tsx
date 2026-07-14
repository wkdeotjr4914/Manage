import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/ui/empty";
import { CreateProject } from "@/components/projects/CreateProject";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "프로젝트 · Second Brain" };

export default async function ProjectsPage() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      owner: { select: { name: true } },
      tasks: { select: { status: true } },
      _count: { select: { links: true } },
    },
  });

  return (
    <div>
      <PageHeader
        title="프로젝트"
        description="칸반으로 일을 관리하고 지식 노트를 연결하세요."
        actions={<CreateProject />}
      />

      <div className="p-6">
        {projects.length === 0 ? (
          <EmptyState
            icon={<FolderKanban className="size-8" />}
            title="프로젝트가 없습니다"
            description="첫 프로젝트를 만들어 태스크를 관리하세요."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => {
              const total = p.tasks.length;
              const done = p.tasks.filter((t) => t.status === "DONE").length;
              const pct = total ? Math.round((done / total) * 100) : 0;
              const color = p.color ?? "#7c6cf0";
              return (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className="group card-shadow card-shadow-hover flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 transition-all hover:border-border-strong"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="size-3 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <h3 className="truncate text-sm font-semibold text-foreground">
                      {p.name}
                    </h3>
                  </div>
                  {p.description && (
                    <p className="line-clamp-2 text-xs leading-relaxed text-muted">
                      {p.description}
                    </p>
                  )}

                  <div className="mt-auto flex flex-col gap-1.5 pt-1">
                    <div className="flex items-center justify-between text-[11px] text-muted-2">
                      <span>
                        {done}/{total} 완료
                      </span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: color }}
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-muted-2">
                      <span>{p.owner?.name ?? "미지정"}</span>
                      <span>{formatDate(p.createdAt)}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

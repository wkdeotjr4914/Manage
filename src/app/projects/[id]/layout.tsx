import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/shell/PageHeader";
import { ProjectTopNav } from "@/components/shell/ProjectTopNav";

export const dynamic = "force-dynamic";

// Shared chrome for every project subpage: the project header + submenu tabs.
// Individual subpages (dashboard, WBS, requirements, …) render below the nav.
export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, name: true, description: true, color: true },
  });
  if (!project) notFound();

  const color = project.color ?? "#7c6cf0";

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            <span
              className="size-3 rounded-full"
              style={{ backgroundColor: color }}
            />
            {project.name}
          </span>
        }
        description={project.description ?? undefined}
        actions={
          <Link
            href="/projects"
            className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> 목록
          </Link>
        }
      />
      <ProjectTopNav projectId={id} />
      {children}
    </div>
  );
}

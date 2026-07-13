"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Project-scoped submenu tabs, ported from spmf's TopNav. The dashboard tab is
// the existing kanban page (/projects/[id]); the rest are the PMS submenus.
const TABS: { seg: string; label: string }[] = [
  { seg: "", label: "대시보드" },
  { seg: "wbs", label: "WBS" },
  { seg: "requirements-def", label: "요구사항 정의" },
  { seg: "requirements", label: "요구사항 명세서" },
  { seg: "tasks", label: "업무 TASK" },
  { seg: "deliverables", label: "산출물 관리" },
];

export function ProjectTopNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;

  // First path segment after the project base ("" on the dashboard). Comparing
  // the whole segment avoids the `requirements` / `requirements-def` prefix
  // collision that `startsWith` would produce.
  const rest = pathname.startsWith(base)
    ? pathname.slice(base.length).replace(/^\//, "")
    : "";
  const currentSeg = rest.split("/")[0];

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-border px-6">
      {TABS.map(({ seg, label }) => {
        const href = seg ? `${base}/${seg}` : base;
        const active = currentSeg === seg;
        return (
          <Link
            key={seg || "root"}
            href={href}
            className={cn(
              "relative whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "text-primary" : "text-muted hover:text-foreground",
            )}
          >
            {label}
            {active && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

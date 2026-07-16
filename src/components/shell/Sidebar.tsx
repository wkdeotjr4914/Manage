"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Network,
  StickyNote,
  Tags,
  FolderKanban,
  Upload,
  MessageCircle,
  Gavel,
  Brain,
  Users,
  Plug,
  Mail,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

const NAV: NavItem[] = [
  { href: "/", label: "대시보드", icon: LayoutDashboard, exact: true },
  { href: "/graph", label: "지식 그래프", icon: Network },
  { href: "/notes", label: "노트", icon: StickyNote },
  { href: "/tags", label: "태그 · 토픽", icon: Tags },
  { href: "/projects", label: "프로젝트", icon: FolderKanban },
  { href: "/bids", label: "입찰공고", icon: Gavel },
  { href: "/mails", label: "수집 메일", icon: Mail },
  { href: "/import", label: "가져오기", icon: Upload, exact: true },
  { href: "/import/kakao", label: "카카오톡", icon: MessageCircle },
  { href: "/settings/integrations", label: "연동", icon: Plug },
];

const ADMIN_NAV: NavItem = { href: "/admin/users", label: "사용자 관리", icon: Users };

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const items = isAdmin ? [...NAV, ADMIN_NAV] : NAV;

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface md:flex">
      <Link href="/" className="flex items-center gap-2.5 px-5 py-5">
        <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_4px_12px_-2px_var(--primary)]">
          <Brain className="size-5" />
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-foreground">
            Second Brain
          </span>
          <span className="text-[11px] text-muted-2">지식 · 프로젝트</span>
        </span>
      </Link>

      <nav className="flex flex-col gap-1 px-3 py-2">
        {items.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-[0_6px_16px_-6px_var(--primary)]"
                  : "text-muted hover:bg-surface-2 hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "size-4.5 transition-colors",
                  active
                    ? "text-primary-foreground"
                    : "text-muted-2 group-hover:text-muted",
                )}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-5 py-4 text-[11px] leading-relaxed text-muted-2">
        회사 내부 지식을 노드와 엣지로 연결하는 두 번째 뇌.
      </div>
    </aside>
  );
}

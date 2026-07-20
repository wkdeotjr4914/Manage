"use client";

import { useState } from "react";
import Link from "next/link";
import { Brain, Search, Bell, LogOut, Menu } from "lucide-react";
import { logout } from "@/server/actions/auth";
import { ThemeToggle } from "./ThemeToggle";
import { MobileNav } from "./MobileNav";
import { navItemsFor } from "./nav";

type TopBarUser = {
  name: string | null;
  email: string;
  role: "MEMBER" | "ADMIN";
};

/** Top header shown on every breakpoint: search + theme toggle + profile.
    On mobile it also carries the primary nav via a hamburger + slide-out
    drawer (the sidebar is desktop-only). */
export function TopBar({ user }: { user: TopBarUser }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const displayName = user.name ?? user.email;
  const initial = displayName.charAt(0).toUpperCase();
  const roleLabel = user.role === "ADMIN" ? "관리자" : "멤버";
  const navItems = navItemsFor(user.role === "ADMIN");
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur-md">
      <div className="flex items-center gap-3 px-3 py-2.5 sm:px-6 sm:py-3">
        {/* mobile: hamburger opens the nav drawer (desktop uses the sidebar) */}
        <button
          type="button"
          aria-label="메뉴 열기"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
          className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-surface-2 text-muted transition-colors hover:bg-surface-3 hover:text-foreground md:hidden"
        >
          <Menu className="size-4.5" />
        </button>

        {/* mobile logo (desktop shows it in the sidebar) */}
        <Link href="/" className="flex items-center gap-2 md:hidden">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Brain className="size-4" />
          </span>
        </Link>

        {/* search — submits to the notes page (real filter via ?q=) */}
        <form action="/notes" method="get" className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-2" />
          <input
            type="search"
            name="q"
            placeholder="노트 검색…"
            aria-label="노트 검색"
            className="h-9 w-full rounded-full border border-border bg-surface-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          />
        </form>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
          <button
            type="button"
            aria-label="알림"
            className="relative grid size-9 place-items-center rounded-full border border-border bg-surface-2 text-muted transition-colors hover:bg-surface-3 hover:text-foreground"
          >
            <Bell className="size-4.5" />
            <span className="absolute right-2.5 top-2.5 size-1.5 rounded-full bg-danger ring-2 ring-surface-2" />
          </button>
          <div className="flex items-center gap-2 rounded-full border border-border bg-surface-2 py-1 pl-1 pr-1 sm:pr-2">
            <span className="grid size-7 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {initial}
            </span>
            <span className="hidden flex-col leading-tight sm:flex">
              <span className="max-w-32 truncate text-xs font-semibold text-foreground">
                {displayName}
              </span>
              <span className="text-[10px] text-muted-2">{roleLabel}</span>
            </span>
            <form action={logout}>
              <button
                type="submit"
                aria-label="로그아웃"
                title="로그아웃"
                className="grid size-7 place-items-center rounded-full text-muted-2 transition-colors hover:bg-surface-3 hover:text-foreground"
              >
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </div>
      </div>

      <MobileNav
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={navItems}
      />
    </header>
  );
}

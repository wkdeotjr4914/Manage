"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brain, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { isNavActive, type NavItem } from "./nav";

/** Slide-out primary nav for mobile (`md:hidden`). Opened by the hamburger in
 * TopBar; reuses the sidebar's vertical menu styling and modal.tsx's overlay
 * pattern. Closes on backdrop click, the X button, and every link tap.
 *
 * Rendered via a portal into <body> so the `fixed inset-0` overlay covers the
 * whole viewport: TopBar's <header> uses `backdrop-blur-md`, and a
 * backdrop-filter ancestor becomes the containing block for fixed descendants —
 * inside the header the drawer would be clipped to the header's height. */
export function MobileNav({
  open,
  onClose,
  items,
}: {
  open: boolean;
  onClose: () => void;
  items: NavItem[];
}) {
  const pathname = usePathname();

  // While open: Esc closes it, and crossing up to the md breakpoint (where the
  // desktop sidebar takes over) closes it so it can't linger hidden.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const mql = window.matchMedia("(min-width: 768px)");
    const onMdUp = () => {
      if (mql.matches) onClose();
    };
    document.addEventListener("keydown", onKey);
    mql.addEventListener("change", onMdUp);
    return () => {
      document.removeEventListener("keydown", onKey);
      mql.removeEventListener("change", onMdUp);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 md:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="메뉴"
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[80%] flex-col border-r border-border bg-surface">
        <div className="flex items-center justify-between px-5 py-5">
          <Link href="/" onClick={onClose} className="flex items-center gap-2.5">
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
          <button
            type="button"
            aria-label="메뉴 닫기"
            onClick={onClose}
            autoFocus
            className="grid size-8 place-items-center rounded-full text-muted-2 transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <X className="size-4.5" />
          </button>
        </div>

        <nav className="flex flex-col gap-1 overflow-y-auto px-3 py-2">
          {items.map(({ href, label, icon: Icon, exact }) => {
            const active = isNavActive({ href, exact }, pathname);
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
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
      </aside>
    </div>,
    document.body,
  );
}

"use client";

import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Light/dark toggle. Renders BOTH icons and lets CSS show the right one based
 * on the `data-theme` attribute (set before paint by the inline script in
 * layout.tsx). The markup is identical on server and client — no theme-derived
 * React state — so it can't trigger a hydration mismatch. The current theme is
 * read from the DOM at click time.
 */
export function ThemeToggle({ className }: { className?: string }) {
  function toggle() {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* localStorage unavailable — ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="테마 전환"
      title="테마 전환"
      className={cn(
        "grid size-9 place-items-center rounded-full border border-border bg-surface-2 text-muted transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        className,
      )}
    >
      {/* light theme → show Moon (click to go dark); dark → show Sun */}
      <Moon className="theme-icon-light size-4.5" />
      <Sun className="theme-icon-dark size-4.5" />
    </button>
  );
}

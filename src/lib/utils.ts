import type { CSSProperties } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-aware className combiner. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Theme-aware tint for an accent color. Mixes the color toward the current
 * surface/foreground tokens so a single accent reads well in both light and
 * dark themes (e.g. a pale-on-dark pastel becomes legibly dark on white).
 * `strong` bumps the fill for active/selected states.
 */
export function tint(color: string, strong = false): CSSProperties {
  return {
    backgroundColor: `color-mix(in srgb, ${color} ${strong ? 24 : 14}%, var(--surface))`,
    borderColor: `color-mix(in srgb, ${color} ${strong ? 60 : 45}%, var(--surface))`,
    color: `color-mix(in srgb, ${color} 72%, var(--foreground))`,
  };
}

/**
 * Date `n` days before now. Kept in a plain module function (not a component
 * body) because the React purity lint forbids calling `Date.now()`/`new Date()`
 * during render.
 */
export function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

/** Format a date for compact display (YYYY.MM.DD). */
export function formatDate(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Convert a Date/ISO string to a `YYYY-MM-DD` value for `<input type="date">`.
 * Uses UTC getters because our dates are stored anchored at noon UTC
 * (parseDateInput) — reading them back in UTC yields the same calendar day
 * regardless of the server/client timezone.
 */
export function toDateInputValue(
  date: Date | string | null | undefined,
): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

/**
 * Parse a `YYYY-MM-DD` input value into a Date anchored at noon UTC, or null
 * when empty/invalid. The noon anchor keeps a date-only value from shifting a
 * day under ±12h timezone offsets (e.g. KST +9) on display.
 */
export function parseDateInput(value: string | null | undefined): Date | null {
  const v = value?.trim();
  if (!v) return null;
  const d = new Date(`${v}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Epoch ms for a `YYYY-MM-DD` value (noon UTC), or null. */
export function dateInputToEpoch(value: string | null | undefined): number | null {
  const d = parseDateInput(value);
  return d ? d.getTime() : null;
}

/** Format epoch ms as `YYYY.MM.DD`. Kept in a module fn to avoid `new Date()`
 * during React render (forbidden by the purity lint). */
export function formatEpoch(ms: number): string {
  return formatDate(new Date(ms));
}

/** Today as a `YYYY-MM-DD` string. Module-scoped so render stays pure. */
export function todayDateInput(): string {
  return toDateInputValue(new Date(Date.now()));
}

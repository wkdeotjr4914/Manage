import { EmptyState } from "@/components/ui/empty";
import {
  dateInputToEpoch,
  formatEpoch,
  todayDateInput,
  cn,
} from "@/lib/utils";

export type GanttRow = {
  id: string;
  name: string;
  start: string; // YYYY-MM-DD or ""
  end: string; // YYYY-MM-DD or ""
  progress?: number;
  color?: string;
  level?: number;
  /** Optional secondary bar (e.g. WBS plan vs. actual). */
  secondary?: { start: string; end: string } | null;
};

const DAY = 86_400_000;

/**
 * Dependency-free CSS Gantt chart. Bars are positioned by percentage across the
 * min→max date span of all rows. Rows without both dates render as label-only.
 */
export function GanttChart({ rows }: { rows: GanttRow[] }) {
  const stamps = rows.flatMap((r) =>
    [
      dateInputToEpoch(r.start),
      dateInputToEpoch(r.end),
      dateInputToEpoch(r.secondary?.start ?? ""),
      dateInputToEpoch(r.secondary?.end ?? ""),
    ].filter((n): n is number => n != null),
  );

  if (stamps.length === 0) {
    return (
      <EmptyState
        title="표시할 일정이 없습니다."
        description="시작일과 종료일을 입력하면 간트 차트에 표시됩니다."
      />
    );
  }

  const min = Math.min(...stamps);
  let max = Math.max(...stamps);
  if (max === min) max = min + DAY;
  const span = max - min;
  const pct = (t: number) => ((t - min) / span) * 100;

  const today = dateInputToEpoch(todayDateInput());
  const showToday = today != null && today >= min && today <= max;

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
      <div className="min-w-[720px]">
        <div className="flex border-b border-border text-xs text-muted-2">
          <div className="w-52 shrink-0 px-3 py-2">작업</div>
          <div className="flex flex-1 justify-between px-3 py-2">
            <span>{formatEpoch(min)}</span>
            <span>{formatEpoch(max)}</span>
          </div>
        </div>

        {rows.map((r) => {
          const s = dateInputToEpoch(r.start);
          const e = dateInputToEpoch(r.end);
          const has = s != null && e != null && e >= s;
          const color = r.color ?? "#7c6cf0";
          const progress = Math.max(0, Math.min(100, r.progress ?? 0));

          const sec = r.secondary;
          const ss = sec ? dateInputToEpoch(sec.start) : null;
          const se = sec ? dateInputToEpoch(sec.end) : null;
          const hasSec = ss != null && se != null && se >= ss;

          return (
            <div
              key={r.id}
              className="flex items-center border-b border-border/50 last:border-0"
            >
              <div
                className="w-52 shrink-0 truncate py-2 pr-3 text-sm text-foreground"
                style={{ paddingLeft: 12 + (r.level ? (r.level - 1) * 14 : 0) }}
                title={r.name}
              >
                {r.name}
              </div>
              <div className="relative h-9 flex-1">
                {showToday && (
                  <div
                    className="absolute inset-y-0 w-px bg-danger/60"
                    style={{ left: `${pct(today!)}%` }}
                  />
                )}

                {hasSec && (
                  <div
                    className="absolute top-1 h-1.5 rounded-full border border-dashed border-muted-2/70"
                    style={{
                      left: `${pct(ss!)}%`,
                      width: `${Math.max(0.5, pct(se!) - pct(ss!))}%`,
                    }}
                    title="계획"
                  />
                )}

                {has ? (
                  <div
                    className={cn(
                      "absolute h-4 overflow-hidden rounded-md",
                      hasSec ? "top-3.5" : "top-2.5",
                    )}
                    style={{
                      left: `${pct(s!)}%`,
                      width: `${Math.max(1.5, pct(e!) - pct(s!))}%`,
                      backgroundColor: `color-mix(in srgb, ${color} 30%, var(--surface))`,
                    }}
                    title={`${r.start} ~ ${r.end} · ${progress}%`}
                  >
                    <div
                      className="h-full rounded-md"
                      style={{
                        width: `${progress}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                ) : (
                  <span className="absolute left-2 top-2 text-xs text-muted-2">
                    일정 미입력
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

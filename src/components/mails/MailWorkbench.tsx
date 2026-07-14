"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  FileText,
  Check,
  Archive,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatDateTime } from "@/lib/utils";
import {
  setCollectedMailStatus,
  convertMailToNote,
} from "@/server/actions/mail";

export type MailRow = {
  id: string;
  subject: string;
  fromAddr: string;
  snippet: string | null;
  body: string;
  internalDate: string | null;
  status: "NEW" | "READ" | "ARCHIVED";
  memo: string | null;
  noteId: string | null;
};

type View = "NEW" | "READ" | "ARCHIVED" | "ALL";

const STATUS_META: Record<MailRow["status"], { label: string; color: string }> = {
  NEW: { label: "신규", color: "#60a5fa" },
  READ: { label: "확인", color: "#34d399" },
  ARCHIVED: { label: "보관", color: "#9ca3af" },
};

export function MailWorkbench({ rows }: { rows: MailRow[] }) {
  const [, startAction] = useTransition();
  const [view, setView] = useState<View>("NEW");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const counts = useMemo(
    () => ({
      NEW: rows.filter((r) => r.status === "NEW").length,
      READ: rows.filter((r) => r.status === "READ").length,
      ARCHIVED: rows.filter((r) => r.status === "ARCHIVED").length,
      ALL: rows.length,
    }),
    [rows],
  );

  const rowsView = useMemo(() => {
    const q = search.trim();
    return rows.filter((r) => {
      if (view !== "ALL" && r.status !== view) return false;
      if (q) {
        const hay = `${r.subject} ${r.fromAddr} ${r.snippet ?? ""}`;
        if (!hay.toLowerCase().includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, view, search]);

  function changeStatus(r: MailRow, status: MailRow["status"]) {
    setError(null);
    setNotice(null);
    setBusyId(r.id);
    startAction(async () => {
      const res = await setCollectedMailStatus({ id: r.id, status });
      setBusyId(null);
      if (!res.ok) setError(res.error);
    });
  }

  function toNote(r: MailRow) {
    setError(null);
    setNotice(null);
    setBusyId(r.id);
    startAction(async () => {
      const res = await convertMailToNote({ id: r.id });
      setBusyId(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNotice(`“${r.subject}” 을(를) 노트로 변환했습니다.`);
    });
  }

  const tabBase =
    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors";
  const tabActive = "bg-primary/20 text-foreground ring-1 ring-primary/30";
  const tabIdle = "text-muted hover:text-foreground";

  const TABS: { key: View; label: string }[] = [
    { key: "NEW", label: `신규 ${counts.NEW}` },
    { key: "READ", label: `확인 ${counts.READ}` },
    { key: "ARCHIVED", label: `보관 ${counts.ARCHIVED}` },
    { key: "ALL", label: `전체 ${counts.ALL}` },
  ];

  return (
    <div className="flex flex-col gap-4 p-6">
      {error && <p className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}
      {notice && <p className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">{notice}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-border bg-surface-2 p-0.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              className={cn(tabBase, view === t.key ? tabActive : tabIdle)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="제목·발신자 검색"
          className="min-w-56 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm sm:max-w-xs"
        />
        <span className="ml-auto text-xs text-muted-2">{rowsView.length}건</span>
      </div>

      {rowsView.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface-2/40 p-8 text-center text-sm text-muted-2">
          표시할 메일이 없습니다. “연동” 메뉴에서 검색어를 지정하고 “지금 Gmail 수집”을 눌러 보세요.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {rowsView.map((r) => {
            const open = openId === r.id;
            const busy = busyId === r.id;
            const meta = STATUS_META[r.status];
            return (
              <div key={r.id} className="rounded-2xl border border-border bg-surface">
                <div className="flex items-start gap-3 p-4">
                  <button
                    onClick={() => setOpenId(open ? null : r.id)}
                    className="mt-0.5 text-muted-2 hover:text-foreground"
                    aria-label={open ? "본문 접기" : "본문 펼치기"}
                  >
                    {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge color={meta.color}>{meta.label}</Badge>
                      <span className="truncate font-medium text-foreground">{r.subject}</span>
                    </div>
                    <div className="mt-0.5 text-[12px] text-muted-2">
                      {r.fromAddr} · {formatDateTime(r.internalDate) || "날짜 미상"}
                    </div>
                    {!open && r.snippet && (
                      <p className="mt-1 line-clamp-1 text-[12px] text-muted">{r.snippet}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {r.noteId ? (
                      <Link
                        href={`/notes/${r.noteId}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-foreground hover:bg-surface-2"
                      >
                        <FileText className="size-3.5" /> 노트 보기
                      </Link>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => toNote(r)} disabled={busy}>
                        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />} 노트로 변환
                      </Button>
                    )}
                    {r.status !== "READ" && (
                      <Button size="sm" variant="ghost" onClick={() => changeStatus(r, "READ")} disabled={busy} title="확인함">
                        <Check className="size-3.5" />
                      </Button>
                    )}
                    {r.status !== "ARCHIVED" ? (
                      <Button size="sm" variant="ghost" onClick={() => changeStatus(r, "ARCHIVED")} disabled={busy} title="보관">
                        <Archive className="size-3.5" />
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => changeStatus(r, "NEW")} disabled={busy} title="신규로 되돌리기">
                        <RotateCcw className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
                {open && (
                  <div className="border-t border-border px-4 py-3">
                    <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-foreground">
                      {r.body || r.snippet || "(본문 없음)"}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

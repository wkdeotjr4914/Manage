"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Upload,
  FileText,
  Sparkles,
  Wand2,
  Loader2,
  Check,
  X,
  ListTodo,
  GitBranch,
  StickyNote,
  ClipboardList,
  Package,
  GanttChartSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Label } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { NODE_TYPES } from "@/lib/theme";
import { cn, formatDate } from "@/lib/utils";
import type { ImportPlan, ImportSource } from "@/lib/import";
import {
  analyzeImport,
  commitImport,
  type PmsCounts,
} from "@/server/actions/import";

// PMS domains extracted by the import pipeline, in preview/checkbox order.
type PmsDomainKey =
  | "requirements"
  | "requirementSpecs"
  | "wbs"
  | "pmsTasks"
  | "deliverables";

const PMS_DOMAINS: {
  key: PmsDomainKey;
  countKey: keyof PmsCounts;
  label: string;
  seg: string;
}[] = [
  {
    key: "requirements",
    countKey: "requirements",
    label: "요구사항 정의",
    seg: "requirements-def",
  },
  {
    key: "requirementSpecs",
    countKey: "requirementSpecs",
    label: "요구사항 명세서",
    seg: "requirements",
  },
  { key: "wbs", countKey: "wbsItems", label: "WBS", seg: "wbs" },
  { key: "pmsTasks", countKey: "pmsTasks", label: "업무 TASK", seg: "tasks" },
  {
    key: "deliverables",
    countKey: "deliverables",
    label: "산출물",
    seg: "deliverables",
  },
];

function planCount(plan: ImportPlan, key: PmsDomainKey): number {
  switch (key) {
    case "requirements":
      return plan.requirements?.length ?? 0;
    case "requirementSpecs":
      return plan.requirementSpecs?.length ?? 0;
    case "wbs":
      return plan.wbsItems?.length ?? 0;
    case "pmsTasks":
      return plan.pmsTasks?.length ?? 0;
    case "deliverables":
      return plan.deliverables?.length ?? 0;
  }
}

type Analyzed = { source: ImportSource; plan?: ImportPlan; error?: string };
type Mode = "heuristic" | "ai";

export function ImportWorkbench({
  aiAvailable,
  projects,
}: {
  aiAvailable: boolean;
  projects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [analyzing, startAnalyze] = useTransition();
  const [committing, startCommit] = useTransition();

  const [files, setFiles] = useState<ImportSource[]>([]);
  const [paste, setPaste] = useState("");
  const [mode, setMode] = useState<Mode>(aiAvailable ? "ai" : "heuristic");
  const [topicName, setTopicName] = useState("");
  const [tagText, setTagText] = useState("");
  // Import attaches documents to an *existing* project only — no auto-create.
  // Default to the most recent project, or "none" when there are none yet.
  const [projectMode, setProjectMode] = useState(projects[0]?.id ?? "none");

  const [analyzed, setAnalyzed] = useState<Analyzed[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savePms, setSavePms] = useState<Record<PmsDomainKey, boolean>>({
    requirements: true,
    requirementSpecs: true,
    wbs: true,
    pmsTasks: true,
    deliverables: true,
  });
  const [result, setResult] = useState<{
    notes: number;
    tasks: number;
    edges: number;
    firstNoteId: string | null;
    projectId: string | null;
    pms: PmsCounts;
  } | null>(null);

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    const read = await Promise.all(
      Array.from(list).map(async (f) => ({ name: f.name, markdown: await f.text() })),
    );
    setFiles((prev) => [...prev, ...read]);
    setAnalyzed(null);
    setResult(null);
  }

  function sources(): ImportSource[] {
    if (files.length) return files;
    if (paste.trim()) return [{ name: "붙여넣은 문서", markdown: paste }];
    return [];
  }

  function analyze() {
    setError(null);
    setResult(null);
    const srcs = sources();
    if (!srcs.length) {
      setError("파일을 올리거나 마크다운을 붙여넣으세요.");
      return;
    }
    startAnalyze(async () => {
      const out: Analyzed[] = [];
      for (const s of srcs) {
        const res = await analyzeImport({
          markdown: s.markdown,
          filename: s.name,
          mode,
        });
        out.push(
          res.ok ? { source: s, plan: res.plan } : { source: s, error: res.error },
        );
      }
      setAnalyzed(out);
    });
  }

  function commit() {
    setError(null);
    const items = (analyzed ?? []).filter((a) => a.plan);
    if (!items.length) {
      setError("가져올 분석 결과가 없습니다.");
      return;
    }
    const extraTags = tagText.split(/[,\s]+/).map((t) => t.trim()).filter(Boolean);
    const skipTasks = projectMode === "none";
    const projectId = projectMode === "none" ? undefined : projectMode;

    startCommit(async () => {
      const totals = { notes: 0, tasks: 0, edges: 0 };
      const pms: PmsCounts = {
        requirements: 0,
        requirementSpecs: 0,
        wbsItems: 0,
        pmsTasks: 0,
        deliverables: 0,
      };
      let firstNoteId: string | null = null;
      let projId: string | null = projectId ?? null;
      for (const it of items) {
        const res = await commitImport({
          plan: it.plan!,
          topicName,
          extraTags,
          projectId: projId ?? undefined,
          sourceKey: it.source.name,
          skipTasks,
          saveRequirements: savePms.requirements,
          saveRequirementSpecs: savePms.requirementSpecs,
          saveWbs: savePms.wbs,
          savePmsTasks: savePms.pmsTasks,
          saveDeliverables: savePms.deliverables,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        totals.notes += res.data.noteCount;
        totals.tasks += res.data.taskCount;
        totals.edges += res.data.edgeCount;
        pms.requirements += res.data.pms.requirements;
        pms.requirementSpecs += res.data.pms.requirementSpecs;
        pms.wbsItems += res.data.pms.wbsItems;
        pms.pmsTasks += res.data.pms.pmsTasks;
        pms.deliverables += res.data.pms.deliverables;
        firstNoteId ??= res.data.firstNoteId;
        // reuse the created project across the remaining docs when auto
        if (!projId) projId = res.data.projectId;
      }
      setResult({ ...totals, firstNoteId, projectId: projId, pms });
      setAnalyzed(null);
      setFiles([]);
      setPaste("");
      router.refresh();
    });
  }

  const analyzedPlans = (analyzed ?? [])
    .filter((a) => a.plan)
    .map((a) => a.plan!);

  const planTotals = analyzedPlans.reduce(
    (acc, plan) => {
      acc.notes += plan.notes.length;
      acc.tasks += plan.tasks.length;
      acc.edges += plan.edges.length;
      return acc;
    },
    { notes: 0, tasks: 0, edges: 0 },
  );

  // Per-domain PMS totals across all analyzed docs (drives the save checkboxes).
  const pmsTotals = PMS_DOMAINS.map((d) => ({
    ...d,
    count: analyzedPlans.reduce((n, plan) => n + planCount(plan, d.key), 0),
  })).filter((d) => d.count > 0);
  const pmsTotal = pmsTotals.reduce((n, d) => n + d.count, 0);

  // ---- success screen ----
  if (result) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="flex flex-col items-center gap-4 rounded-xl border border-success/30 bg-success/5 p-8 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-success/15 text-success">
            <Check className="size-6" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-foreground">가져오기 완료</h2>
            <p className="mt-1 text-sm text-muted">
              노트 {result.notes} · 태스크 {result.tasks} · 연결 {result.edges} 생성됨
            </p>
            {(() => {
              const p = result.pms;
              const total =
                p.requirements +
                p.requirementSpecs +
                p.wbsItems +
                p.pmsTasks +
                p.deliverables;
              if (!total) return null;
              return (
                <p className="mt-1 text-sm text-muted">
                  요구사항 {p.requirements} · 명세 {p.requirementSpecs} · WBS{" "}
                  {p.wbsItems} · 업무 {p.pmsTasks} · 산출물 {p.deliverables}
                </p>
              );
            })()}
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/graph">
              <Button variant="secondary">
                <GitBranch className="size-4" /> 그래프 보기
              </Button>
            </Link>
            {result.projectId && (
              <Link href={`/projects/${result.projectId}`}>
                <Button variant="secondary">
                  <ListTodo className="size-4" /> 프로젝트 보기
                </Button>
              </Link>
            )}
            {result.projectId && result.pms.requirements > 0 && (
              <Link href={`/projects/${result.projectId}/requirements-def`}>
                <Button variant="secondary">
                  <ClipboardList className="size-4" /> 요구사항 정의
                </Button>
              </Link>
            )}
            {result.projectId && result.pms.wbsItems > 0 && (
              <Link href={`/projects/${result.projectId}/wbs`}>
                <Button variant="secondary">
                  <GanttChartSquare className="size-4" /> WBS
                </Button>
              </Link>
            )}
            {result.firstNoteId && (
              <Link href={`/notes/${result.firstNoteId}`}>
                <Button variant="secondary">
                  <StickyNote className="size-4" /> 노트 보기
                </Button>
              </Link>
            )}
          </div>
          <Button onClick={() => setResult(null)}>다른 문서 가져오기</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      {/* input */}
      <div className="flex flex-col gap-3">
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            onFiles(e.dataTransfer.files);
          }}
          className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border-strong bg-surface-2/40 px-6 py-10 text-center transition-colors hover:bg-surface-2"
        >
          <Upload className="size-6 text-muted-2" />
          <p className="text-sm font-medium text-foreground">
            마크다운(.md) 파일을 끌어다 놓거나 클릭해서 선택
          </p>
          <p className="text-xs text-muted-2">여러 개 선택 가능 · 회의록·문서</p>
          <input
            ref={fileRef}
            type="file"
            accept=".md,.markdown,.mdx,text/markdown"
            multiple
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
        </div>

        {files.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {files.map((f, i) => (
              <span
                key={i}
                className="group inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 py-1 pl-2 pr-1 text-xs text-foreground"
              >
                <FileText className="size-3.5 text-muted-2" />
                {f.name}
                <button
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  className="rounded p-0.5 text-muted-2 hover:text-danger"
                  aria-label="제거"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {files.length === 0 && (
          <div>
            <Label>또는 마크다운 붙여넣기</Label>
            <Textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={"# 회의록 제목\n\n## 안건\n- ...\n\n## 할 일\n- ..."}
              className="min-h-40 font-mono text-[13px]"
            />
          </div>
        )}
      </div>

      {/* options */}
      <div className="grid grid-cols-1 gap-4 rounded-2xl border border-border bg-surface-2 p-4 sm:grid-cols-2">
        <div>
          <Label>정리 방식</Label>
          <div className="flex rounded-lg border border-border bg-surface-2 p-0.5">
            <button
              onClick={() => setMode("ai")}
              disabled={!aiAvailable}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-40",
                mode === "ai"
                  ? "bg-primary/20 text-foreground ring-1 ring-primary/30"
                  : "text-muted hover:text-foreground",
              )}
            >
              <Sparkles className="size-3.5" /> AI 스마트
            </button>
            <button
              onClick={() => setMode("heuristic")}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                mode === "heuristic"
                  ? "bg-primary/20 text-foreground ring-1 ring-primary/30"
                  : "text-muted hover:text-foreground",
              )}
            >
              <Wand2 className="size-3.5" /> 규칙 기반
            </button>
          </div>
          {!aiAvailable && (
            <p className="mt-1 text-[11px] text-muted-2">
              AI 모드는 GEMINI_API_KEY 설정 시 켜집니다.
            </p>
          )}
        </div>

        <div>
          <Label>프로젝트 (문서를 귀속시킬 곳)</Label>
          <Select value={projectMode} onChange={(e) => setProjectMode(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="none">프로젝트에 연결 안 함</option>
          </Select>
          {projects.length === 0 && (
            <p className="mt-1 text-[11px] text-muted-2">
              등록된 프로젝트가 없습니다. 먼저{" "}
              <Link href="/projects" className="underline">
                프로젝트
              </Link>
              를 만든 뒤 가져오세요.
            </p>
          )}
        </div>

        <div>
          <Label>토픽 (선택 · 모든 노트에 적용)</Label>
          <Input
            value={topicName}
            onChange={(e) => setTopicName(e.target.value)}
            placeholder="예: TIPS 도전의 IR"
          />
        </div>
        <div>
          <Label>공통 태그 (선택 · 쉼표 구분)</Label>
          <Input
            value={tagText}
            onChange={(e) => setTagText(e.target.value)}
            placeholder="예: 회의록, TIPS"
          />
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {/* PMS binding — pick which extracted domains to write into the project */}
      {analyzed && pmsTotal > 0 && (
        <div className="rounded-2xl border border-border bg-surface-2 p-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <ClipboardList className="size-3.5" /> 프로젝트 서브메뉴에 반영할 항목
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {pmsTotals.map((d) => (
              <label
                key={d.key}
                className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
              >
                <input
                  type="checkbox"
                  checked={savePms[d.key]}
                  onChange={(e) =>
                    setSavePms((s) => ({ ...s, [d.key]: e.target.checked }))
                  }
                  className="size-4 rounded border-border"
                />
                {d.label}
                <span className="text-xs text-muted-2">{d.count}</span>
              </label>
            ))}
          </div>
          {projectMode === "none" && (
            <p className="mt-2 text-[11px] text-danger">
              ‘프로젝트에 연결 안 함’ 상태에서는 서브메뉴에 저장되지 않습니다.
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button onClick={analyze} disabled={analyzing} variant="secondary">
          {analyzing ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
          분석하기
        </Button>
        {analyzed && planTotals.notes > 0 && (
          <Button onClick={commit} disabled={committing}>
            {committing ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            가져오기 (노트 {planTotals.notes} · 태스크 {planTotals.tasks}
            {pmsTotal > 0 ? ` · PMS ${pmsTotal}` : ""})
          </Button>
        )}
      </div>

      {/* preview */}
      {analyzed && (
        <div className="flex flex-col gap-4">
          {analyzed.map((a, i) => (
            <PreviewCard key={i} analyzed={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function datesMeta(parts: [string, string | undefined][]): string | undefined {
  const segs = parts
    .filter(([, v]) => v)
    .map(([label, v]) => `${label} ${formatDate(v!)}`);
  return segs.length ? segs.join(" · ") : undefined;
}

function PmsGroup({
  icon,
  title,
  rows,
}: {
  icon: React.ReactNode;
  title: string;
  rows: { name: string; meta?: string }[];
}) {
  if (!rows.length) return null;
  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-2">
        {icon} {title} {rows.length}
      </p>
      <ul className="flex flex-col gap-0.5">
        {rows.slice(0, 8).map((r, i) => (
          <li
            key={i}
            className="flex items-center justify-between gap-2 text-xs text-muted"
          >
            <span className="truncate">• {r.name}</span>
            {r.meta && (
              <span className="shrink-0 text-muted-2">{r.meta}</span>
            )}
          </li>
        ))}
        {rows.length > 8 && (
          <li className="text-xs text-muted-2">…외 {rows.length - 8}개</li>
        )}
      </ul>
    </div>
  );
}

function PreviewCard({ analyzed }: { analyzed: Analyzed }) {
  if (analyzed.error) {
    return (
      <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm">
        <p className="font-medium text-foreground">{analyzed.source.name}</p>
        <p className="mt-1 text-danger">{analyzed.error}</p>
      </div>
    );
  }
  const plan = analyzed.plan!;
  const tags = [...new Set(plan.notes.flatMap((n) => n.tags))];
  return (
    <div className="rounded-2xl border border-border bg-surface-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <FileText className="size-4 text-muted-2" />
        <span className="text-sm font-semibold text-foreground">
          {plan.documentTitle}
        </span>
        {plan.topicName && <Badge color="#22d3ee">토픽: {plan.topicName}</Badge>}
        {plan.projectName && <Badge color="#a78bfa">프로젝트: {plan.projectName}</Badge>}
        <span className="ml-auto text-xs text-muted-2">
          노트 {plan.notes.length} · 태스크 {plan.tasks.length} · 연결 {plan.edges.length}
        </span>
      </div>

      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <Badge key={t}>#{t}</Badge>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {plan.notes.map((n) => {
          const meta = NODE_TYPES[n.type];
          return (
            <span
              key={n.key}
              className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]"
              style={{
                backgroundColor: `${meta.color}14`,
                borderColor: `${meta.color}40`,
                color: meta.color,
              }}
              title={n.summary ?? ""}
            >
              <span className="size-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
              {n.title}
            </span>
          );
        })}
      </div>

      {plan.tasks.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-2">
            <ListTodo className="size-3.5" /> 태스크 {plan.tasks.length}
          </p>
          <ul className="flex flex-col gap-0.5">
            {plan.tasks.slice(0, 8).map((t, i) => (
              <li key={i} className="truncate text-xs text-muted">
                • {t.title}
              </li>
            ))}
            {plan.tasks.length > 8 && (
              <li className="text-xs text-muted-2">…외 {plan.tasks.length - 8}개</li>
            )}
          </ul>
        </div>
      )}

      <PmsGroup
        icon={<ClipboardList className="size-3.5" />}
        title="요구사항 정의"
        rows={(plan.requirements ?? []).map((r) => ({
          name: r.name,
          meta: datesMeta([
            ["요청", r.requestDate],
            ["기한", r.dueDate],
            ["목표", r.targetDate],
          ]),
        }))}
      />
      <PmsGroup
        icon={<FileText className="size-3.5" />}
        title="요구사항 명세서"
        rows={(plan.requirementSpecs ?? []).map((r) => ({
          name: r.name,
          meta: datesMeta([
            ["요청", r.requestDate],
            ["기한", r.dueDate],
            ["목표", r.targetDate],
          ]),
        }))}
      />
      <PmsGroup
        icon={<GanttChartSquare className="size-3.5" />}
        title="WBS"
        rows={(plan.wbsItems ?? []).map((w) => ({
          name: w.name,
          meta: datesMeta([
            ["시작", w.startDate],
            ["종료", w.endDate],
          ]),
        }))}
      />
      <PmsGroup
        icon={<ListTodo className="size-3.5" />}
        title="업무 TASK"
        rows={(plan.pmsTasks ?? []).map((t) => ({
          name: t.name,
          meta: datesMeta([
            ["시작", t.startDate],
            ["종료", t.endDate],
          ]),
        }))}
      />
      <PmsGroup
        icon={<Package className="size-3.5" />}
        title="산출물"
        rows={(plan.deliverables ?? []).map((d) => ({ name: d.name }))}
      />
    </div>
  );
}

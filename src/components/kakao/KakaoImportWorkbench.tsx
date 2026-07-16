"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  MessageCircle,
  Users,
  Calendar,
  Loader2,
  Check,
  X,
  Sparkles,
  ListTodo,
  ClipboardList,
  GitBranch,
  FolderKanban,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, Label } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  parseKakaoExport,
  chunkMessages,
  groupToPlan,
  KAKAO_MAX_CHUNKS,
  type KakaoParseResult,
  type KakaoGroup,
  type KakaoTaskDraft,
  type KakaoRequirementDraft,
} from "@/lib/kakao";
import { analyzeKakaoChat } from "@/server/actions/kakao";
import { commitImport } from "@/server/actions/import";

const NONE = "none"; // dropdown value for "연결 안 함"

// AI group + per-card UI edit state.
type EditableGroup = {
  projectName: string;
  projectId: string | null;
  summary: string;
  tasks: KakaoTaskDraft[];
  requirements: KakaoRequirementDraft[];
  include: boolean;
  taskChecked: boolean[];
  reqChecked: boolean[];
  saveTasks: boolean;
  saveReqs: boolean;
};

type CommitSummary = {
  groups: number;
  notes: number;
  tasks: number;
  requirements: number;
  projectIds: string[];
  firstNoteId: string | null;
};

function toEditable(g: KakaoGroup): EditableGroup {
  return {
    projectName: g.projectName,
    projectId: g.projectId,
    summary: g.summary,
    tasks: g.tasks,
    requirements: g.requirements,
    include: true,
    taskChecked: g.tasks.map(() => true),
    reqChecked: g.requirements.map(() => true),
    saveTasks: true,
    saveReqs: true,
  };
}

export function KakaoImportWorkbench({
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

  const [parsed, setParsed] = useState<KakaoParseResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [groups, setGroups] = useState<EditableGroup[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CommitSummary | null>(null);

  const chunkCount = useMemo(
    () =>
      parsed
        ? Math.min(chunkMessages(parsed.messages).length, KAKAO_MAX_CHUNKS)
        : 0,
    [parsed],
  );

  async function onFile(list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    setError(null);
    setNotice(null);
    setResult(null);
    setGroups(null);
    try {
      const raw = await file.text();
      const res = parseKakaoExport(raw);
      if (!res.messages.length) {
        setError("메시지를 찾지 못했습니다. 카카오톡 ‘대화 내보내기(.txt)’ 파일인지 확인하세요.");
        setParsed(null);
        return;
      }
      setParsed(res);
      setFileName(file.name);
    } catch {
      setError(`파일을 읽지 못했습니다: ${file.name}`);
      setParsed(null);
    }
  }

  function analyze() {
    if (!parsed) return;
    setError(null);
    setNotice(null);
    startAnalyze(async () => {
      const res = await analyzeKakaoChat({
        messages: parsed.messages,
        roomName: parsed.roomName,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (!res.groups.length) {
        setGroups([]);
        setNotice("업무로 분류할 만한 내용을 찾지 못했습니다.");
        return;
      }
      setGroups(res.groups.map(toEditable));
      const msgs: string[] = [];
      if (res.truncated)
        msgs.push("대화가 매우 길어 앞부분 일부만 분석했습니다.");
      if (res.partialFailures > 0)
        msgs.push(`${res.partialFailures}개 구간은 분석에 실패해 건너뛰었습니다.`);
      setNotice(msgs.join(" ") || null);
    });
  }

  function patch(idx: number, next: Partial<EditableGroup>) {
    setGroups((gs) =>
      gs ? gs.map((g, i) => (i === idx ? { ...g, ...next } : g)) : gs,
    );
  }

  function commit() {
    if (!parsed || !groups) return;
    const included = groups.filter((g) => g.include);
    if (!included.length) {
      setError("가져올 그룹을 선택하세요.");
      return;
    }
    setError(null);
    startCommit(async () => {
      const summary: CommitSummary = {
        groups: 0,
        notes: 0,
        tasks: 0,
        requirements: 0,
        projectIds: [],
        firstNoteId: null,
      };
      for (const g of included) {
        const filtered: KakaoGroup = {
          projectName: g.projectName,
          projectId: g.projectId,
          summary: g.summary,
          tasks: g.saveTasks ? g.tasks.filter((_, i) => g.taskChecked[i]) : [],
          requirements: g.saveReqs
            ? g.requirements.filter((_, i) => g.reqChecked[i])
            : [],
        };
        const res = await commitImport({
          plan: groupToPlan(filtered, parsed.roomName),
          sourceKey: `kakao:${fileName}:${g.projectName}`,
          source: "KAKAO",
          projectId: g.projectId ?? undefined,
          skipTasks: !g.projectId, // no project → conversation note only
          saveRequirements: g.saveReqs,
          savePmsTasks: g.saveTasks,
        });
        if (!res.ok) {
          setError(`‘${g.projectName}’ 저장 실패: ${res.error}`);
          return;
        }
        summary.groups += 1;
        summary.notes += res.data.noteCount;
        summary.tasks += res.data.taskCount;
        summary.requirements += res.data.pms.requirements;
        summary.firstNoteId ??= res.data.firstNoteId;
        if (res.data.projectId && !summary.projectIds.includes(res.data.projectId))
          summary.projectIds.push(res.data.projectId);
      }
      setResult(summary);
      setGroups(null);
      setParsed(null);
      setFileName("");
      router.refresh();
    });
  }

  // ---- success screen ----
  if (result) {
    const projName = (id: string) =>
      projects.find((p) => p.id === id)?.name ?? "프로젝트";
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="flex flex-col items-center gap-4 rounded-xl border border-success/30 bg-success/5 p-8 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-success/15 text-success">
            <Check className="size-6" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              가져오기 완료
            </h2>
            <p className="mt-1 text-sm text-muted">
              프로젝트 {result.groups} · 노트 {result.notes} · 업무 {result.tasks} ·
              요구사항 {result.requirements} 생성됨
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/graph">
              <Button variant="secondary">
                <GitBranch className="size-4" /> 그래프 보기
              </Button>
            </Link>
            {result.projectIds.map((id) => (
              <Link key={id} href={`/projects/${id}/tasks`}>
                <Button variant="secondary">
                  <FolderKanban className="size-4" /> {projName(id)}
                </Button>
              </Link>
            ))}
          </div>
          <Button onClick={() => setResult(null)}>다른 대화 가져오기</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      {/* file input */}
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onFile(e.dataTransfer.files);
        }}
        className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border-strong bg-surface-2/40 px-6 py-10 text-center transition-colors hover:bg-surface-2"
      >
        <MessageCircle className="size-6 text-muted-2" />
        <p className="text-sm font-medium text-foreground">
          카카오톡 대화 내보내기(.txt)를 끌어다 놓거나 클릭해서 선택
        </p>
        <p className="text-xs text-muted-2">
          카카오톡 대화방 → 메뉴 → 대화 내보내기 → 텍스트만 보내기(.txt)
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".txt"
          className="hidden"
          onChange={(e) => onFile(e.target.files)}
        />
      </div>

      {error && <p className="whitespace-pre-line text-sm text-danger">{error}</p>}

      {/* parsed meta */}
      {parsed && (
        <div className="rounded-2xl border border-border bg-surface-2 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <MessageCircle className="size-4 text-muted-2" />
            <span className="text-sm font-semibold text-foreground">
              {parsed.roomName}
            </span>
            <button
              onClick={() => {
                setParsed(null);
                setGroups(null);
                setFileName("");
              }}
              className="ml-auto rounded p-1 text-muted-2 hover:text-danger"
              aria-label="제거"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-3.5 text-muted-2" /> 참여자{" "}
              {parsed.participants.length}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MessageCircle className="size-3.5 text-muted-2" /> 메시지{" "}
              {parsed.messageCount}
            </span>
            {parsed.dateRange && (
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="size-3.5 text-muted-2" />{" "}
                {parsed.dateRange.start} ~ {parsed.dateRange.end}
              </span>
            )}
            <span className="text-muted-2">
              제외 시스템 {parsed.droppedSystem} · 미디어 {parsed.droppedMedia}
            </span>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <Button onClick={analyze} disabled={!aiAvailable || analyzing}>
              {analyzing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              AI로 프로젝트별 분류
            </Button>
            {analyzing && (
              <span className="text-xs text-muted-2">
                {chunkCount}개 구간 분석 중… (길면 1~2분 걸릴 수 있어요)
              </span>
            )}
          </div>
          {!aiAvailable && (
            <p className="mt-2 text-[11px] text-muted-2">
              AI 분류는 GEMINI_API_KEY 설정 시 켜집니다.
            </p>
          )}
        </div>
      )}

      {notice && (
        <p className="flex items-center gap-1.5 text-xs text-warning">
          <AlertTriangle className="size-3.5" /> {notice}
        </p>
      )}

      {/* commit bar */}
      {groups && groups.length > 0 && (
        <div className="flex items-center gap-2">
          <Button onClick={commit} disabled={committing}>
            {committing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            가져오기 ({groups.filter((g) => g.include).length}개 프로젝트)
          </Button>
          <span className="text-xs text-muted-2">
            프로젝트를 확인/보정한 뒤 가져오세요.
          </span>
        </div>
      )}

      {/* group cards */}
      {groups?.map((g, idx) => (
        <div
          key={g.projectName}
          className={cn(
            "rounded-2xl border bg-surface-2 p-4 transition-opacity",
            g.include ? "border-border" : "border-border opacity-50",
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-foreground">
              <input
                type="checkbox"
                checked={g.include}
                onChange={(e) => patch(idx, { include: e.target.checked })}
                className="size-4 rounded border-border"
              />
              {g.projectName === "미분류" ? (
                <Badge>미분류</Badge>
              ) : (
                <Badge color="#a78bfa">{g.projectName}</Badge>
              )}
            </label>
            <span className="ml-auto text-xs text-muted-2">
              업무 {g.tasks.length} · 요구사항 {g.requirements.length}
            </span>
          </div>

          {/* project mapping */}
          <div className="mt-3">
            <Label>저장할 프로젝트</Label>
            <Select
              value={g.projectId ?? NONE}
              onChange={(e) =>
                patch(idx, {
                  projectId: e.target.value === NONE ? null : e.target.value,
                })
              }
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value={NONE}>연결 안 함 (노트만 저장)</option>
            </Select>
          </div>

          {g.summary && (
            <p className="mt-3 whitespace-pre-line border-t border-border pt-3 text-xs text-muted">
              {g.summary}
            </p>
          )}

          {/* tasks — only savable when a project is selected */}
          {g.tasks.length > 0 && (
            <div
              className={cn(
                "mt-3 border-t border-border pt-3",
                !g.projectId && "opacity-50",
              )}
            >
              <label className="mb-1.5 flex cursor-pointer items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-2">
                <input
                  type="checkbox"
                  checked={g.saveTasks && !!g.projectId}
                  disabled={!g.projectId}
                  onChange={(e) => patch(idx, { saveTasks: e.target.checked })}
                  className="size-3.5 rounded border-border"
                />
                <ListTodo className="size-3.5" /> 업무 TASK {g.tasks.length}
              </label>
              {g.saveTasks && !!g.projectId && (
                <ul className="flex flex-col gap-0.5">
                  {g.tasks.map((t, i) => (
                    <li key={i}>
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
                        <input
                          type="checkbox"
                          checked={g.taskChecked[i]}
                          onChange={(e) =>
                            patch(idx, {
                              taskChecked: g.taskChecked.map((c, j) =>
                                j === i ? e.target.checked : c,
                              ),
                            })
                          }
                          className="size-3.5 rounded border-border"
                        />
                        <span className="truncate">{t.title}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* requirements — only savable when a project is selected */}
          {g.requirements.length > 0 && (
            <div
              className={cn(
                "mt-3 border-t border-border pt-3",
                !g.projectId && "opacity-50",
              )}
            >
              <label className="mb-1.5 flex cursor-pointer items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-2">
                <input
                  type="checkbox"
                  checked={g.saveReqs && !!g.projectId}
                  disabled={!g.projectId}
                  onChange={(e) => patch(idx, { saveReqs: e.target.checked })}
                  className="size-3.5 rounded border-border"
                />
                <ClipboardList className="size-3.5" /> 요구사항 정의{" "}
                {g.requirements.length}
              </label>
              {g.saveReqs && !!g.projectId && (
                <ul className="flex flex-col gap-0.5">
                  {g.requirements.map((r, i) => (
                    <li key={i}>
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
                        <input
                          type="checkbox"
                          checked={g.reqChecked[i]}
                          onChange={(e) =>
                            patch(idx, {
                              reqChecked: g.reqChecked.map((c, j) =>
                                j === i ? e.target.checked : c,
                              ),
                            })
                          }
                          className="size-3.5 rounded border-border"
                        />
                        <span className="truncate">{r.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {!g.projectId && (
            <p className="mt-2 text-[11px] text-warning">
              연결된 프로젝트가 없어 대화 노트만 저장됩니다. 업무·요구사항을
              저장하려면 프로젝트를 선택하세요.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

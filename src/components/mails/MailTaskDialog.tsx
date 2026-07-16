"use client";

import {
  useRef,
  useState,
  useTransition,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  Sparkles,
  Bot,
  Check,
  CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select, Label } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { TASK_PRIORITIES } from "@/lib/theme";
import type { MailTaskDraft } from "@/lib/mailTasks";
import {
  analyzeMailTasks,
  registerMailTasks,
  analyzeMailTasksViaHermes,
} from "@/server/actions/mail";
import type { MailRow } from "./MailWorkbench";

type CommitSummary = { taskCount: number; pmsTaskCount: number };

/**
 * 수집 메일 1건을 프로젝트 업무로 등록하는 모달.
 * 프로젝트 선택 → Gemini / 에이전트(Hermes 프록시)가 본문을 업무로 분해(미리보기)
 * → 양쪽에서 체크한 항목만 등록. 둘 다 동기 호출(한 번 await).
 */
export function MailTaskDialog({
  mail,
  projects,
  aiAvailable,
  agentAvailable,
  onClose,
}: {
  mail: MailRow;
  projects: { id: string; name: string }[];
  aiAvailable: boolean;
  agentAvailable: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [analyzing, startAnalyze] = useTransition();
  const [agentAnalyzing, startAgent] = useTransition();
  const [committing, startCommit] = useTransition();

  const [projectId, setProjectId] = useState<string>(
    mail.projectId ?? projects[0]?.id ?? "",
  );
  const [tasks, setTasks] = useState<MailTaskDraft[] | null>(null);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<CommitSummary | null>(null);

  // 에이전트(Hermes 프록시) 경로 — Gemini와 동일한 동기 호출.
  const [agentTasks, setAgentTasks] = useState<MailTaskDraft[] | null>(null);
  const [agentChecked, setAgentChecked] = useState<boolean[]>([]);
  const [agentError, setAgentError] = useState<string | null>(null);
  // 프로젝트 변경 등으로 진행 중이던 에이전트 요청을 무효화하기 위한 시퀀스.
  const agentSeq = useRef(0);

  const projectName = projects.find((p) => p.id === projectId)?.name ?? "";
  const geminiSelected = tasks ? checked.filter(Boolean).length : 0;
  const agentSelected = agentTasks ? agentChecked.filter(Boolean).length : 0;
  const selectedCount = geminiSelected + agentSelected;
  const agentBusy = agentAnalyzing;

  // 프로젝트가 바뀌면 양쪽 분석 결과를 무효화.
  function onProjectChange(id: string) {
    setProjectId(id);
    setTasks(null);
    setAgentTasks(null);
    agentSeq.current++; // 진행 중이던 에이전트 요청 결과를 무효화
    setAgentError(null);
    setNotice(null);
    setError(null);
  }

  function analyze() {
    if (!projectId) {
      setError("먼저 프로젝트를 선택하세요.");
      return;
    }
    setError(null);
    setNotice(null);
    startAnalyze(async () => {
      const res = await analyzeMailTasks({ mailId: mail.id, projectId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTasks(res.tasks);
      setChecked(res.tasks.map(() => true));
      if (!res.tasks.length) {
        setNotice("Gemini가 업무로 등록할 만한 내용을 찾지 못했습니다.");
      }
    });
  }

  function runAgent() {
    if (!projectId) {
      setError("먼저 프로젝트를 선택하세요.");
      return;
    }
    setError(null);
    setNotice(null);
    setAgentError(null);
    setAgentTasks(null);
    const seq = agentSeq.current; // 완료 시점에 프로젝트가 바뀌었는지 검사
    startAgent(async () => {
      const res = await analyzeMailTasksViaHermes({ mailId: mail.id, projectId });
      if (seq !== agentSeq.current) return; // 그 사이 프로젝트가 바뀌면 결과 버림
      if (!res.ok) {
        setAgentError(res.error);
        return;
      }
      setAgentTasks(res.tasks);
      setAgentChecked(res.tasks.map(() => true));
      if (!res.tasks.length) {
        setNotice("에이전트가 업무로 등록할 만한 내용을 찾지 못했습니다.");
      }
    });
  }

  function register() {
    const geminiSel = tasks ? tasks.filter((_, i) => checked[i]) : [];
    const agentSel = agentTasks ? agentTasks.filter((_, i) => agentChecked[i]) : [];
    const selected = [...geminiSel, ...agentSel].slice(0, 50); // registerMailTasks 상한
    if (!selected.length) {
      setError("등록할 업무를 하나 이상 선택하세요.");
      return;
    }
    setError(null);
    startCommit(async () => {
      const res = await registerMailTasks({ mailId: mail.id, projectId, tasks: selected });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult(res.data ?? { taskCount: 0, pmsTaskCount: 0 });
      router.refresh();
    });
  }

  // ---- 등록 완료 화면 ----
  if (result) {
    return (
      <Modal open onClose={onClose} title="업무 등록 완료">
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <span className="grid size-11 place-items-center rounded-full bg-success/15 text-success">
            <Check className="size-5" />
          </span>
          <p className="text-sm text-muted">
            <span className="font-medium text-foreground">{projectName}</span> 프로젝트에
            <br />
            칸반 업무 {result.taskCount}건 · PMS 업무 {result.pmsTaskCount}건 등록됨
          </p>
          <div className="mt-1 flex gap-2">
            <Link href={`/projects/${projectId}`}>
              <Button variant="secondary" size="sm">
                칸반 보드
              </Button>
            </Link>
            <Link href={`/projects/${projectId}/tasks`}>
              <Button variant="secondary" size="sm">
                업무 목록
              </Button>
            </Link>
            <Button size="sm" onClick={onClose}>
              닫기
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title="업무로 등록"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          {error ? (
            <span className="text-xs text-danger">{error}</span>
          ) : (
            <span className="text-xs text-muted-2">
              {tasks || agentTasks
                ? `${selectedCount}건 선택`
                : "AI 또는 에이전트가 메일을 업무로 분해합니다."}
            </span>
          )}
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose} disabled={committing}>
              닫기
            </Button>
            <Button
              onClick={register}
              disabled={!selectedCount || committing || analyzing}
            >
              {committing ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              등록 ({selectedCount})
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* 메일 요약 */}
        <div className="rounded-xl border border-border bg-surface-2 px-3 py-2">
          <p className="truncate text-sm font-medium text-foreground">{mail.subject}</p>
          <p className="mt-0.5 truncate text-[12px] text-muted-2">{mail.fromAddr}</p>
        </div>

        {/* 프로젝트 선택 + 분석 버튼 2종 */}
        <div>
          <Label htmlFor="mail-task-project">등록할 프로젝트</Label>
          {projects.length === 0 ? (
            <p className="text-sm text-warning">먼저 프로젝트를 만들어 주세요.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Select
                id="mail-task-project"
                value={projectId}
                onChange={(e) => onProjectChange(e.target.value)}
                className="min-w-40 flex-1"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              <Button
                variant="secondary"
                onClick={analyze}
                disabled={!aiAvailable || !projectId || analyzing}
                className="shrink-0"
              >
                {analyzing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                AI 분석
              </Button>
              <Button
                variant="secondary"
                onClick={runAgent}
                disabled={!agentAvailable || !projectId || agentBusy}
                className="shrink-0"
              >
                {agentBusy ? <Loader2 className="size-4 animate-spin" /> : <Bot className="size-4" />}
                에이전트 분석
              </Button>
            </div>
          )}
          {!aiAvailable && (
            <p className="mt-1.5 text-[11px] text-muted-2">
              AI 분석은 GEMINI_API_KEY 설정 시 켜집니다.
            </p>
          )}
          {!agentAvailable && (
            <p className="mt-1 text-[11px] text-muted-2">
              에이전트 분석은 HERMES_PROXY_URL·HERMES_PROXY_KEY 설정 시 켜집니다.
            </p>
          )}
        </div>

        {notice && <p className="text-xs text-warning">{notice}</p>}

        {/* 분석 결과 — Gemini(좌) / 에이전트(우) 나란히 */}
        {(tasks || analyzing || agentBusy || agentTasks || agentError) && (
          <div className="grid grid-cols-1 gap-4 border-t border-border pt-3 sm:grid-cols-2">
            {/* Gemini 컬럼 */}
            <div className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-2">
                <Sparkles className="size-3.5" /> Gemini 분석
                {tasks && tasks.length > 0 && (
                  <span className="normal-case tracking-normal">
                    · {geminiSelected}/{tasks.length}
                  </span>
                )}
              </span>
              {tasks ? (
                tasks.length ? (
                  <TaskCards tasks={tasks} checked={checked} setChecked={setChecked} />
                ) : (
                  <p className="text-xs text-muted-2">추출된 업무가 없습니다.</p>
                )
              ) : analyzing ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-2">
                  <Loader2 className="size-3.5 animate-spin" /> 분석 중…
                </p>
              ) : (
                <p className="text-xs text-muted-2">‘AI 분석’으로 Gemini 결과를 받으세요.</p>
              )}
            </div>

            {/* 에이전트(Hermes) 컬럼 */}
            <div className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-2">
                <Bot className="size-3.5" /> 에이전트(Hermes) 분석
                {agentTasks && agentTasks.length > 0 && (
                  <span className="normal-case tracking-normal">
                    · {agentSelected}/{agentTasks.length}
                  </span>
                )}
              </span>
              {agentBusy ? (
                <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted-2">
                  <p className="flex items-center gap-1.5">
                    <Loader2 className="size-3.5 animate-spin" /> 에이전트 분석 중… 최대 1~2분
                  </p>
                  <p className="mt-1 text-[11px] text-warning">
                    창을 닫으면 결과가 유실됩니다.
                  </p>
                </div>
              ) : agentError ? (
                <p className="text-xs text-danger">{agentError}</p>
              ) : agentTasks ? (
                agentTasks.length ? (
                  <TaskCards
                    tasks={agentTasks}
                    checked={agentChecked}
                    setChecked={setAgentChecked}
                  />
                ) : (
                  <p className="text-xs text-muted-2">추출된 업무가 없습니다.</p>
                )
              ) : (
                <p className="text-xs text-muted-2">
                  ‘에이전트 분석’으로 Hermes 결과를 받으세요.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** 업무 초안 체크박스 카드 목록. Gemini/에이전트 두 컬럼이 공유. */
function TaskCards({
  tasks,
  checked,
  setChecked,
}: {
  tasks: MailTaskDraft[];
  checked: boolean[];
  setChecked: Dispatch<SetStateAction<boolean[]>>;
}) {
  const allSelected =
    tasks.length > 0 && checked.filter(Boolean).length === tasks.length;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setChecked(tasks.map(() => !allSelected))}
          className="text-[11px] text-muted-2 hover:text-foreground"
        >
          {allSelected ? "전체 해제" : "전체 선택"}
        </button>
      </div>
      <ul className="flex flex-col gap-1.5">
        {tasks.map((t, i) => {
          const pri = TASK_PRIORITIES[t.priority];
          return (
            <li key={i}>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-2">
                <input
                  type="checkbox"
                  checked={checked[i] ?? false}
                  onChange={(e) =>
                    setChecked((c) => c.map((v, j) => (j === i ? e.target.checked : v)))
                  }
                  className="mt-0.5 size-4 shrink-0 rounded border-border"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-foreground">{t.title}</span>
                    <Badge color={pri.color}>{pri.label}</Badge>
                    {t.dueDate && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-2">
                        <CalendarClock className="size-3" /> {t.dueDate}
                      </span>
                    )}
                  </span>
                  {t.description && (
                    <span className="mt-0.5 line-clamp-2 block text-[12px] text-muted">
                      {t.description}
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
